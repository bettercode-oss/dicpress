import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: { select: { tag: { select: { name: true } } } },
      versions: { orderBy: { versionNo: "desc" }, take: 10 },
    },
  });

  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(document);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const { title, slug, summary, contentMd, status, thumbnailUrl, tags } = body;

  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  // 배포 또는 비공개 전환 시 공개 페이지 캐시 즉시 갱신
  const slugChanged = slug && slug !== existing.slug;
  const becamePublished = status === "PUBLISHED";
  const becameUnpublished = status === "DRAFT" || status === "ARCHIVED";

  if (becamePublished || becameUnpublished || slugChanged) {
    revalidatePath(`/${document.slug}`);
    revalidatePath("/");
    if (slugChanged) revalidatePath(`/${existing.slug}`);
  }

  return NextResponse.json(document);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id }, select: { slug: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.document.delete({ where: { id } });

  revalidatePath(`/${doc.slug}`);
  revalidatePath("/");

  return NextResponse.json({ success: true });
}
