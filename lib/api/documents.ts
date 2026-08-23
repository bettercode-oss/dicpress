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

/** 파라미터 값이 잘못됐을 때. 라우트는 400 으로, 화면은 깨끗한 URL 로 되돌리는 데 쓴다. */
export type ParamError = { paramError: string };

const STATUS_VALUES = Object.values(DocumentStatus);
const SCOPE_VALUES: DocumentScopeParam[] = ["mine", "all"];
const TRUTHY = ["1", "true"];
const FALSY = ["0", "false"];

/**
 * 쿼리스트링에서 목록 파라미터를 뽑는다. 라우트와 관리자 화면이 같은 해석을 쓰도록 여기 둔다.
 *
 * **모르는 값과 지정 안 함을 구분한다.** 예전에는 둘 다 `null` 로 떨어져서,
 * `status=DRAFTT` 나 `status=published` 같은 오타가 "필터 해제" 로 동작했다.
 * `status=DRAFT` 는 0건인데 `status=DRAFTT` 는 전체를 돌려주는 식이었다(#79).
 * 필터를 걸었다고 믿은 호출자가 필터 없는 결과를 받는 것이 이 함수가 막아야 할 것이다.
 *
 * 값이 **비어 있는 것**(`?status=`)은 지정 안 함으로 본다. HTML 폼이 빈 필드를 그렇게
 * 보내고, 빈 값은 "잘못된 필터" 가 아니라 "필터 없음" 으로 읽는 것이 자연스럽다.
 * 위험한 것은 필터처럼 **보이는데** 틀린 값이지 비어 있는 값이 아니다.
 *
 * 대소문자는 **정확히 일치**해야 한다. `published` 를 받아주지 않는다.
 * - 응답의 `items[].status`·`scope` 가 이미 정규 표기라 그대로 되돌려 보내면 통한다.
 * - 한 값에 표기가 둘이면 로그·URL·분석이 갈린다.
 * - 400 이 허용값을 알려주므로, 변형을 조용히 받아 그 습관이 퍼지게 두는 것보다 낫다.
 *
 * (`X-Actor-Email` 을 소문자로 정규화하는 것과 다른 판단이다. 이메일은 사람을 가리키는
 * 식별자라 대소문자 무시가 그 도메인의 관례지만, 여기 값들은 프로토콜 토큰이다.)
 *
 * 모르는 **파라미터 이름**은 그대로 무시한다. Next 가 `_rsc` 같은 쿼리를 스스로 붙이므로
 * 이름까지 화이트리스트로 막으면 프레임워크가 깨진다.
 */
export function parseListParams(searchParams: URLSearchParams): DocumentListParams | ParamError {
  const rawStatus = searchParams.get("status");
  let status: DocumentStatus | null = null;
  if (rawStatus) {
    if (!STATUS_VALUES.includes(rawStatus as DocumentStatus)) {
      return { paramError: `status 값이 올바르지 않습니다: 허용값은 ${STATUS_VALUES.join(", ")} 입니다` };
    }
    status = rawStatus as DocumentStatus;
  }

  // scope 는 모르는 값이 **넓은 쪽**("all")으로 떨어져서 status 보다 위험했다.
  const rawScope = searchParams.get("scope");
  let scope: DocumentScopeParam = "all";
  if (rawScope) {
    if (!SCOPE_VALUES.includes(rawScope as DocumentScopeParam)) {
      return { paramError: `scope 값이 올바르지 않습니다: 허용값은 ${SCOPE_VALUES.join(", ")} 입니다` };
    }
    scope = rawScope as DocumentScopeParam;
  }

  const rawCounts = searchParams.get("counts");
  let withCounts = false;
  if (rawCounts) {
    if (TRUTHY.includes(rawCounts)) withCounts = true;
    else if (!FALSY.includes(rawCounts)) {
      return { paramError: `counts 값이 올바르지 않습니다: ${[...TRUTHY, ...FALSY].join(", ")} 중 하나여야 합니다` };
    }
  }

  return { scope, status, q: searchParams.get("q"), tag: searchParams.get("tag"), withCounts };
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
