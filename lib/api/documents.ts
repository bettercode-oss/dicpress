import { Prisma, DocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documentScope } from "@/lib/document-access";
import type { Actor } from "@/lib/authz";

/**
 * 문서 목록 조회의 **유일한 지점**.
 *
 * `/api/documents` 라우트 핸들러와 관리자 목록 화면이 둘 다 여기를 부른다.
 * 화면이 자기 앱의 API 를 fetch 하게 만들지 않는 이유는, 서버 컴포넌트가 그러려면
 * 절대 URL 과 쿠키 수동 전달이 필요하고 왕복이 한 번 더 붙기 때문이다.
 * 중요한 것은 "HTTP 를 타는 것" 이 아니라 **정책과 질의가 한 곳에 있는 것**이다.
 */

/** 목록에 실리는 문서 한 건. 태그는 평탄화해서 내보낸다. */
export type DocumentListItem = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: DocumentStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; email: string };
  tags: string[];
};

export type DocumentCounts = Record<"ALL" | DocumentStatus, number>;

export type DocumentScopeParam = "mine" | "all";

export type DocumentListParams = {
  /** 기본 "all" — documentScope() 를 그대로 따른다. "mine" 은 본인 문서로 좁히는 옵션. */
  scope?: DocumentScopeParam;
  status?: DocumentStatus | null;
  q?: string | null;
  tag?: string | null;
  withCounts?: boolean;
};

export type DocumentListResult = {
  /** 실제로 적용된 scope. AUTHOR 가 all 을 요청하면 mine 이 되므로 요청과 다를 수 있다. */
  scope: DocumentScopeParam;
  total: number;
  items: DocumentListItem[];
  counts?: DocumentCounts;
};

const LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true } },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.DocumentSelect;

/** 쿼리스트링에서 목록 파라미터를 뽑는다. 라우트와 화면이 같은 해석을 쓰도록 여기 둔다. */
export function parseListParams(searchParams: URLSearchParams): DocumentListParams {
  const status = searchParams.get("status");
  return {
    scope: searchParams.get("scope") === "mine" ? "mine" : "all",
    status: status && status in DocumentStatus ? (status as DocumentStatus) : null,
    q: searchParams.get("q"),
    tag: searchParams.get("tag"),
    withCounts: searchParams.get("counts") === "1",
  };
}

/**
 * 목록을 읽는다.
 *
 * AUTHOR 가 `scope=all` 을 보내도 거절하지 않고 `documentScope()` 와 AND 로 교집합을 취해
 * 조용히 좁힌다. 대신 결과의 `scope` 에 실제 적용값을 실어 화면이 정직하게 렌더하게 한다.
 * 권한 정책은 어디까지나 `documentScope()` 한 곳이고, scope 는 그 위에 얹는 필터일 뿐이다.
 */
export async function listDocuments(
  actor: Actor,
  params: DocumentListParams = {},
): Promise<DocumentListResult> {
  const { scope = "all", status = null, q = null, tag = null, withCounts = false } = params;

  const narrowed = scope === "mine" ? { authorId: actor.id } : {};
  // AUTHOR 는 documentScope() 자체가 본인 문서라, all 을 요청해도 결과적으로 mine 이다.
  const effectiveScope: DocumentScopeParam =
    scope === "mine" || actor.role === "AUTHOR" ? "mine" : "all";

  // status 를 뺀 조건. 카운트는 상태별 탭을 그리는 값이라 status 필터가 들어가면 안 된다.
  const baseWhere: Prisma.DocumentWhereInput = {
    AND: [
      documentScope(actor),
      narrowed,
      ...(tag ? [{ tags: { some: { tag: { name: tag } } } }] : []),
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { summary: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            },
          ]
        : []),
    ],
  };

  const where: Prisma.DocumentWhereInput = status ? { AND: [baseWhere, { status }] } : baseWhere;

  const documents = await prisma.document.findMany({
    where,
    select: LIST_SELECT,
    orderBy: { updatedAt: "desc" },
  });

  const items: DocumentListItem[] = documents.map((d) => ({
    ...d,
    tags: d.tags.map((t) => t.tag.name),
  }));

  const result: DocumentListResult = {
    scope: effectiveScope,
    total: items.length,
    items,
  };

  if (withCounts) result.counts = await countByStatus(baseWhere);

  return result;
}

/** 상태별 문서 수. 없는 상태도 0 으로 채워 화면이 분기하지 않게 한다. */
async function countByStatus(where: Prisma.DocumentWhereInput): Promise<DocumentCounts> {
  const grouped = await prisma.document.groupBy({ by: ["status"], where, _count: true });

  const counts: DocumentCounts = { ALL: 0, DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  for (const row of grouped) {
    counts[row.status] = row._count;
    counts.ALL += row._count;
  }
  return counts;
}
