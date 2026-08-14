import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function NewDocumentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const doc = await prisma.document.create({
    data: {
      title: "새 문서",
      slug: `draft-${Date.now()}`,
      contentMd: "",
      status: "DRAFT",
      authorId: session.user.id,
    },
  });

  redirect(`/admin/documents/${doc.id}/edit`);
}
