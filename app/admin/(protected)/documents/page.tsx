import { DocumentStatus } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/authz";
import { listDocuments, parseListParams, type DocumentScopeParam } from "@/lib/api/documents";
import { DeleteDocumentButton } from "@/components/admin/DeleteDocumentButton";
import { NewDocumentButton } from "@/components/admin/NewDocumentButton";

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

const NEW_BUTTON_CLASS =
  "px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-60";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; scope?: string }>;
}) {
  // 라우트 핸들러와 같은 Actor·같은 정책을 쓴다. 세션이 없거나 정지된 계정이면 로그인으로.
  const actor = await getSessionActor();
  if (!actor) redirect("/admin/login");

  const { status, q, scope } = await searchParams;

  // 파싱을 API 라우트와 공유한다. 예전에는 여기 같은 로직이 한 벌 더 있었고,
  // 그 사본도 모르는 값을 조용히 "필터 없음" 으로 떨어뜨리고 있었다(#79).
  const parsed = parseListParams(
    new URLSearchParams(
      Object.entries({ status, q, scope }).filter(([, v]) => v != null) as [string, string][],
    ),
  );
  // 화면에서는 400 을 띄우는 대신 깨끗한 주소로 되돌린다. 주소창을 손댄 결과일 뿐이고,
  // 필터가 안 걸린 목록을 걸린 것처럼 보여주지만 않으면 된다.
  if ("paramError" in parsed) redirect("/admin/documents");

  const requestedScope: DocumentScopeParam = parsed.scope ?? "all";
  const { items, counts, scope: effectiveScope } = await listDocuments(actor, {
    ...parsed,
    withCounts: true,
  });

  // OWNER·ADMIN 만 "전체 / 내 문서" 선택이 의미가 있다. AUTHOR 는 언제나 본인 문서다.
  const canSeeAll = actor.role !== "AUTHOR";
  const keep = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, scope: requestedScope, ...extra })) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `/admin/documents?${qs}` : "/admin/documents";
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">문서 목록</h1>
        <NewDocumentButton className={NEW_BUTTON_CLASS}>+ 새 문서</NewDocumentButton>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        {[undefined, "DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => (
          <Link
            key={s ?? "all"}
            href={keep({ status: s })}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              status === s || (!status && !s)
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {s ? STATUS_LABEL[s as DocumentStatus] : "전체"}
            {counts ? ` (${s ? counts[s as DocumentStatus] : counts.ALL})` : ""}
          </Link>
        ))}
        <form method="get" action="/admin/documents" className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {requestedScope === "mine" && <input type="hidden" name="scope" value="mine" />}
          <input
            name="q"
            defaultValue={q}
            placeholder="제목 검색..."
            className="text-sm border border-gray-200 rounded px-3 py-1 outline-none focus:border-blue-400"
          />
        </form>
      </div>

      {canSeeAll && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          <Link
            href={keep({ scope: undefined })}
            className={effectiveScope === "all" ? "text-gray-900 font-medium" : "text-gray-400 hover:text-gray-700"}
          >
            전체 문서
          </Link>
          <span className="text-gray-200">·</span>
          <Link
            href={keep({ scope: "mine" })}
            className={effectiveScope === "mine" ? "text-gray-900 font-medium" : "text-gray-400 hover:text-gray-700"}
          >
            내 문서
          </Link>
        </div>
      )}

      {/* Document Table */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">문서가 없습니다</p>
          <NewDocumentButton className="text-sm text-blue-600 hover:underline">
            첫 번째 문서를 작성해보세요 →
          </NewDocumentButton>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">제목</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">태그</th>
                {canSeeAll && (
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">작성자</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">상태</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">수정일</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{doc.title}</div>
                    <div className="text-xs text-gray-400">{doc.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.map((name) => (
                        <span key={name} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                  </td>
                  {canSeeAll && (
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {doc.author.name ?? doc.author.email}
                    </td>
                  )}
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
