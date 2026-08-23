import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";
import { requireActor } from "@/lib/authz";
import { listDocuments, parseListParams } from "@/lib/api/documents";

export async function GET(req: NextRequest) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);
  // 모르는 값은 조용히 무시하지 않는다. 그러면 필터를 걸었다고 믿은 쪽이
  // 필터 없는 결과를 받는다(#79). 에러 형태는 다른 400 과 같은 { error } 다.
  if ("paramError" in params) {
    return NextResponse.json({ error: params.paramError }, { status: 400 });
  }

  return NextResponse.json(await listDocuments(actor, params));
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const { title, slug, summary, contentMd, status, thumbnailUrl, tags } = body;

  const contentHtml = await markdownToHtml(contentMd || "");

  try {
    const document = await prisma.document.create({
      data: {
        title: title || "새 문서",
        // slug 는 유니크다. 안 주면 임시값을 만들어 두고 편집 화면에서 고치게 한다.
        slug: slug || `draft-${Date.now()}`,
        summary,
        contentMd: contentMd ?? "",
        contentHtml,
        status: status || "DRAFT",
        thumbnailUrl,
        authorId: actor.id,
        ...(status === "PUBLISHED" && { publishedAt: new Date() }),
        ...(tags?.length && {
          tags: {
            create: tags.map((name: string) => ({
              tag: { connectOrCreate: { where: { name }, create: { name } } },
            })),
          },
        }),
      },
    });

    // PUBLISHED 로 바로 만들면 공개 화면이 낡은 채로 남는다.
    // 목록은 revalidate=60, 사이트맵은 3600 이라 사이트맵이 특히 오래 간다.
    // 요청 본문이 아니라 **생성 결과**를 본다 — PATCH 와 같은 기준이다.
    if (document.status === "PUBLISHED") {
      // "layout" 이 있어야 왼쪽 키워드 목록에 들어간다 — PATCH 의 주석 참고 (#74).
      revalidatePath("/", "layout");
      revalidatePath("/sitemap.xml");
    }

    return NextResponse.json(document, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "이미 사용 중인 slug 입니다" }, { status: 409 });
    }
    throw e;
  }
}
