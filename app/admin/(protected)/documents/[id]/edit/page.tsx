import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionActor } from "@/lib/authz";
import { canAccessDocument } from "@/lib/document-access";
import EditorClient from "@/components/admin/EditorClient";

/**
 * 제목도 권한을 확인한 뒤에 노출한다.
 *
 * 예전에는 인증 검사 없이 `findUnique` 로 제목을 읽어서, 로그인한 AUTHOR 가 아무 문서 id 나
 * 넣으면 `<title>` 로 남의 문서 제목이 샜다.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor();
  if (!actor) return { title: "편집" };

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { title: true, authorId: true },
  });
  if (!doc || !canAccessDocument(actor, doc)) return { title: "편집" };

  return { title: `${doc.title} 편집 — 관리자` };
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor();
  if (!actor) redirect("/admin/login");

  const { id } = await params;

  // 예전에는 `where: { id, authorId }` 로 본인 문서만 열었다. PATCH /api/documents/[id] 는
  // OWNER·ADMIN 에게 남의 문서 수정을 허용하는데 편집 화면만 404 를 내는 모순 상태였다.
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  // 권한 없음도 notFound 로 처리한다 — 403 과 404 를 가르면 문서 존재 여부가 새어 나간다.
  if (!document || !canAccessDocument(actor, document)) notFound();

  return <EditorClient document={document} />;
}
