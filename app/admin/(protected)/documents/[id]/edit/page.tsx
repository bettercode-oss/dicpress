import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import EditorClient from "@/components/admin/EditorClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id }, select: { title: true } });
  return { title: doc ? `${doc.title} 편집 — 관리자` : "편집" };
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id, authorId: session.user.id },
    include: {
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  if (!document) notFound();

  return <EditorClient document={document} />;
}
