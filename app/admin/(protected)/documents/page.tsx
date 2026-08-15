import { prisma } from "@/lib/prisma";
import { DocumentStatus } from "@prisma/client";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DeleteDocumentButton } from "@/components/admin/DeleteDocumentButton";

export const metadata = { title: "문서 목록 — 관리자" };

const STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  ARCHIVED: "보관됨",
};

const STATUS_COLOR: Record<DocumentStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-700",
  PUBLISHED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const { status, q } = await searchParams;

  const documents = await prisma.document.findMany({
    where: {
      authorId: session.user.id,
      ...(status && { status: status as DocumentStatus }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const counts = await prisma.document.groupBy({
    by: ["status"],
    where: { authorId: session.user.id },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">문서 목록</h1>
        <Link
          href="/admin/documents/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          + 새 문서
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        {[undefined, "DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/documents?status=${s}` : "/admin/documents"}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              status === s || (!status && !s)
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {s ? STATUS_LABEL[s as DocumentStatus] : "전체"}
            {s
              ? countMap[s as DocumentStatus]
                ? ` (${countMap[s as DocumentStatus]})`
                : ""
              : ""}
          </Link>
        ))}
        <form method="get" action="/admin/documents" className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="제목 검색..."
            className="text-sm border border-gray-200 rounded px-3 py-1 outline-none focus:border-blue-400"
          />
        </form>
      </div>

      {/* Document Table */}
      {documents.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">문서가 없습니다</p>
          <Link href="/admin/documents/new" className="text-sm text-blue-600 hover:underline">
            첫 번째 문서를 작성해보세요 →
          </Link>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">제목</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">태그</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">상태</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">수정일</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{doc.title}</div>
                    <div className="text-xs text-gray-400">{doc.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.map(({ tag }) => (
                        <span key={tag.name} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[doc.status]}`}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(doc.updatedAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/documents/${doc.id}/edit`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      편집
                    </Link>
                    <DeleteDocumentButton id={doc.id} title={doc.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
