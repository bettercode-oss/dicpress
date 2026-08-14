import { prisma } from "@/lib/prisma";
import DictionaryLayout from "@/components/public/DictionaryLayout";

export const revalidate = 60;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const docs = await prisma.document.findMany({
    where: { status: "PUBLISHED" },
    select: {
      title: true,
      slug: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { title: "asc" },
  });

  const docList = docs.map((d) => ({
    title: d.title,
    slug: d.slug,
    tags: d.tags.map((t) => t.tag.name),
  }));

  return <DictionaryLayout docs={docList}>{children}</DictionaryLayout>;
}
