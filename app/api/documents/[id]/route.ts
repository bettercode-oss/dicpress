import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  const contentHtml = contentMd ? await markdownToHtml(contentMd) : undefined;

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNo: "desc" },
  });
  const nextVersionNo = (latestVersion?.versionNo ?? 0) + 1;

  const document = await prisma.$transaction(async (tx) => {
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
        ...(contentMd && { contentMd }),
        ...(contentHtml && { contentHtml }),
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
  });

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
  const slugChanged = document.slug !== existing.slug;

  if (wasPublished || isPublished) {
    revalidatePath(`/${document.slug}`);
    revalidatePath("/");
    // 사이트맵은 revalidate=3600 이라 손대지 않으면 한 시간 낡은 채로 남는다.
    revalidatePath("/sitemap.xml");
    // 슬러그가 바뀌면 예전 주소의 캐시도 지운다.
    if (slugChanged) revalidatePath(`/${existing.slug}`);
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

  revalidatePath(`/${doc.slug}`);
  revalidatePath("/");
  revalidatePath("/sitemap.xml");

  return NextResponse.json({ success: true });
}
