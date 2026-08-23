import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";
import { requireActor } from "@/lib/authz";
import { requireDocumentAccess } from "@/lib/document-access";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const existing = await requireDocumentAccess(actor, id);
  if (existing instanceof NextResponse) return existing;

  const { versionNo } = await req.json();
  const target = await prisma.documentVersion.findFirst({ where: { documentId: id, versionNo } });
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

  // 조건은 문서의 실제 상태를 본다(요청 본문에는 status 가 없다).
  // 목록(`/`)은 제목·슬러그·태그만 쓰는데 복원은 본문만 바꾸므로 갱신할 필요가 없다.
  // 사이트맵은 updatedAt 을 lastModified 로 쓰고 복원이 그 값을 건드리므로 갱신한다.
  if (existing.status === "PUBLISHED") {
    revalidatePath(`/${existing.slug}`);
    revalidatePath("/sitemap.xml");
  }

  return NextResponse.json({ contentMd: document.contentMd });
}
