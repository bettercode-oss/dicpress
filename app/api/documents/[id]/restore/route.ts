import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { versionNo } = await req.json();

  const [existing, target] = await Promise.all([
    prisma.document.findUnique({ where: { id } }),
    prisma.documentVersion.findFirst({ where: { documentId: id, versionNo } }),
  ]);

  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const contentHtml = await markdownToHtml(target.contentMd);

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNo: "desc" },
  });
  const nextVersionNo = (latestVersion?.versionNo ?? 0) + 1;

  const document = await prisma.$transaction(async (tx) => {
    // 현재 상태를 새 버전으로 저장한 뒤 복원
    await tx.documentVersion.create({
      data: {
        documentId: id,
        contentMd: existing.contentMd,
        contentHtml: existing.contentHtml,
        versionNo: nextVersionNo,
      },
    });

    return tx.document.update({
      where: { id },
      data: { contentMd: target.contentMd, contentHtml },
    });
  });

  if (existing.status === "PUBLISHED") {
    revalidatePath(`/${existing.slug}`);
  }

  return NextResponse.json({ contentMd: document.contentMd });
}
