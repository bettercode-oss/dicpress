import { prisma } from "@/lib/prisma";
import { markdownToHtml } from "@/lib/markdown";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = 600;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const doc = await prisma.document.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { title: true, summary: true, thumbnailUrl: true, publishedAt: true },
  });

  if (!doc) return { title: "Not Found" };

  return {
    title: `${doc.title} — ${SITE_NAME}`,
    description: doc.summary ?? undefined,
    openGraph: {
      title: doc.title,
      description: doc.summary ?? undefined,
      url: `${SITE_URL}/${slug}`,
      siteName: SITE_NAME,
      type: "article",
      publishedTime: doc.publishedAt?.toISOString(),
      images: doc.thumbnailUrl ? [{ url: doc.thumbnailUrl }] : [],
    },
    twitter: {
      card: "summary",
      title: doc.title,
      description: doc.summary ?? undefined,
    },
    alternates: { canonical: `${SITE_URL}/${slug}` },
  };
}

export async function generateStaticParams() {
  const docs = await prisma.document.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  });
  return docs.map((d) => ({ slug: d.slug }));
}

export default async function SlugPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const doc = await prisma.document.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { tags: { select: { tag: { select: { name: true } } } } },
  });

  if (!doc) notFound();

  const html = doc.contentHtml || (await markdownToHtml(doc.contentMd));

  return (
    <article className="max-w-3xl mx-auto px-6 py-8">
      {/* Document header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
          {doc.title}
        </h1>

        {doc.summary && (
          <p className="text-base text-gray-500 mb-4 leading-relaxed">{doc.summary}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {doc.tags.map(({ tag }) => (
            <span
              key={tag.name}
              className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
            >
              {tag.name}
            </span>
          ))}
          {doc.publishedAt && (
            <time
              dateTime={doc.publishedAt.toISOString()}
              className="text-xs text-gray-400 ml-auto"
            >
              {new Date(doc.publishedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
        </div>

        {doc.thumbnailUrl && (
          <img
            src={doc.thumbnailUrl}
            alt={doc.title}
            className="mt-5 w-full rounded-lg object-cover max-h-60"
          />
        )}
      </header>

      <hr className="border-gray-100 mb-8" />

      {/* Prose body */}
      <div
        className="prose prose-gray max-w-none
          prose-headings:font-bold
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:font-normal
          prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg
          prose-blockquote:border-blue-400 prose-blockquote:text-gray-600
          prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
