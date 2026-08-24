import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";
import { requireActor } from "@/lib/authz";
import { canAccessDocument, forbidden, requireDocumentAccess } from "@/lib/document-access";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: { select: { tag: { select: { name: true } } } },
      versions: { orderBy: { versionNo: "desc" }, take: 10 },
    },
  });

  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessDocument(actor, document)) return forbidden();

  return NextResponse.json(document);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const existing = await requireDocumentAccess(actor, id);
  if (existing instanceof NextResponse) return existing;

  const body = await req.json();
  const { title, slug, summary, contentMd, status, thumbnailUrl, tags } = body;

  // 보내지 않은 것(undefined)과 빈 값을 보낸 것은 다르다. 빈 값을 조용히 무시하면
  // 200 을 받은 쪽이 반영됐다고 믿는다(#88) — 목록 쿼리에서 정리한 것과 같은 기준(#79).
  // 제목과 slug 는 비울 수 없는 값이라 거절한다. 빈 제목은 목록에서 빈 줄이 되고
  // 빈 slug 는 공개 URL 을 깨뜨린다.
  const isBlank = (v: unknown) => v !== undefined && (typeof v !== "string" || v.trim() === "");
  if (isBlank(title)) {
    return NextResponse.json({ error: "제목은 비울 수 없습니다" }, { status: 400 });
  }
  if (isBlank(slug)) {
    return NextResponse.json({ error: "slug 는 비울 수 없습니다" }, { status: 400 });
  }

  // contentMd 는 반대다 — 본문을 비우는 것은 정상적인 편집이라 "" 를 그대로 저장한다.
  const contentHtml = contentMd !== undefined ? await markdownToHtml(contentMd) : undefined;

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNo: "desc" },
  });
  const nextVersionNo = (latestVersion?.versionNo ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    await tx.documentVersion.create({
      data: {
        documentId: id,
        contentMd: existing.contentMd,
        contentHtml: existing.contentHtml,
        versionNo: nextVersionNo,
      },
    });

    if (tags !== undefined) {
      await tx.documentTag.deleteMany({ where: { documentId: id } });
    }

    return tx.document.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(slug && { slug }),
        ...(summary !== undefined && { summary }),
        ...(contentMd !== undefined && { contentMd }),
        ...(contentHtml !== undefined && { contentHtml }),
        ...(status && { status }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
        ...(status === "PUBLISHED" && !existing.publishedAt && { publishedAt: new Date() }),
        ...(tags !== undefined && {
          tags: {
            create: tags.map((name: string) => ({
              tag: {
                connectOrCreate: { where: { name }, create: { name } },
              },
            })),
          },
        }),
      },
    });
  }).catch((e: unknown) => {
    // slug 는 유니크다. POST 와 같은 409 를 돌려준다 — 500 은 { error } 본문이 없어
    // 콘솔이 사유를 화면에 실을 수 없고 "알 수 없는 오류" 로 뜬다(#88).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "이미 사용 중인 slug 입니다" }, { status: 409 });
    }
    throw e;
  });
  if (result instanceof NextResponse) return result;
  const document = result;

  // 공개 페이지 캐시 갱신.
  //
  // 판단 기준은 **문서의 실제 상태**다. 요청 본문에 무엇이 실려 왔는지가 아니다.
  // 예전 조건(`status === "PUBLISHED"`)은 "요청이 PUBLISHED 를 보냈다" 는 뜻이라,
  // `{ contentMd }` 만 담은 부분 PATCH 로 이미 발행된 문서를 고치면 조건이 거짓이 되어
  // 공개 페이지가 최대 10분(`revalidate = 600`) 낡은 채로 남았다.
  // dicpress 자체 편집기는 자동저장마다 status 를 함께 보내 우연히 가려져 있었지만,
  // 부분 갱신을 보내는 클라이언트(관리자 콘솔)에서는 그대로 드러난다.
  const wasPublished = existing.status === "PUBLISHED";
  const isPublished = document.status === "PUBLISHED";

  if (wasPublished || isPublished) {
    // ⚠️ 두 번째 인자 "layout" 을 빼면 **왼쪽 키워드 목록이 갱신되지 않는다.**
    //
    // 그 목록은 `app/(public)/page.tsx` 가 아니라 `app/(public)/layout.tsx` 에서 조회한다.
    // `revalidatePath("/")` 는 기본 타입이 'page' 라 레이아웃 세그먼트를 건드리지 못한다.
    // 운영에서 실측했다 — 발행 직후에는 목록에 없다가 레이아웃 revalidate=60 의 자연 만료
    // 시점인 T+66초에 나타났다(#74).
    //
    // 'layout' 은 그 아래 모든 공개 페이지를 함께 무효화하므로 상세 페이지와 바뀌기 전
    // 슬러그까지 덮는다. 대신 편집 중 자동저장마다 공개 캐시가 통째로 날아간다.
    // 조건을 "목록에 보이는 필드가 바뀔 때만" 으로 좁힐 수도 있지만, 바로 그런 영리한
    // 조건이 직전에 우리를 물었고(#72), 편집기는 언제나 tags 를 함께 보내 이득도 없다.
    revalidatePath("/", "layout");
    // 사이트맵은 라우트 핸들러라 위 무효화에 포함되지 않는다. revalidate=3600 이라
    // 손대지 않으면 한 시간 낡은 채로 남는다.
    revalidatePath("/sitemap.xml");
  }

  return NextResponse.json(document);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const doc = await requireDocumentAccess(actor, id);
  if (doc instanceof NextResponse) return doc;

  await prisma.document.delete({ where: { id } });

  // 목록에서 빼려면 레이아웃까지 무효화해야 한다 — 위 PATCH 의 주석 참고 (#74).
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");

  return NextResponse.json({ success: true });
}
