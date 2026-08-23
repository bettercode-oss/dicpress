import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { maskEmail } from "@/lib/mask";
import type { UserRole } from "@prisma/client";

/** 요청을 수행한 주체가 어느 경로로 들어왔는지. */
export type ActorSource = "session" | "service";

/** 요청을 수행하는 주체. 세션이든 서비스 토큰이든 같은 모양으로 수렴한다. */
export type Actor = {
  id: string;
  email: string;
  role: UserRole;
  source: ActorSource;
};

/** 이메일 최대 길이 (RFC 5321). 헤더로 들어오는 값이라 상한을 둔다. */
const MAX_EMAIL_LENGTH = 254;

/**
 * 서비스 토큰을 비교한다.
 *
 * 해시를 거치는 이유는 두 가지다. `timingSafeEqual` 은 길이가 다르면 `RangeError` 를
 * 던지는데, 그대로 500 이 나가면 그 자체가 "길이가 다르다"는 오라클이 된다.
 * 해시로 길이를 32바이트에 고정하면 예외도 길이 누설도 없다.
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * DB 에서 사용자를 읽어 Actor 를 만든다. **role 과 status 의 진실은 언제나 DB 다.**
 *
 * 없거나 ACTIVE 가 아니면 null. 호출자가 경로에 맞는 상태 코드를 고른다.
 */
async function loadActiveActor(
  where: { id: string } | { email: string },
  source: ActorSource,
): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where,
    select: { id: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, email: user.email, role: user.role, source };
}

/**
 * 요청 주체를 확정한다. 실패 시 그대로 반환하면 되는 응답을 돌려준다.
 *
 *   const actor = await requireActor(req, ["OWNER", "ADMIN"]); // roles 생략 시 로그인만 확인
 *   if (actor instanceof NextResponse) return actor;
 *
 * 두 경로를 받는다.
 *
 * 1. **서비스 토큰** — admin.bizos.kr 콘솔이 서버사이드에서 부를 때.
 *    `Authorization: Bearer <ADMIN_SERVICE_TOKEN>` + `X-Actor-Email: <로그인 사용자>`.
 * 2. **세션 쿠키** — dicpress 자체 관리자 UI 가 브라우저에서 부를 때.
 *
 * ## 신뢰 경계
 *
 * `X-Actor-Email` 은 **토큰이 유효할 때만** 읽는다. 토큰을 쥔 쪽은 아무 이메일이나 보내
 * 그 사람을 사칭할 수 있다는 뜻이고, 그래서 이 토큰은 사실상 OWNER 비밀번호에 가깝다.
 * 실질적인 방어는 nginx 가 클라이언트발 `Authorization` 을 비워서(`proxy_set_header
 * Authorization "";`) 토큰 경로를 루프백 전용으로 만드는 데 있다. 자세한 근거는
 * `docs/decisions/002-admin-console-service-token.md` 참고.
 *
 * 헤더로 넘어온 role 류 정보는 어떤 것도 신뢰하지 않는다. 매 요청 DB 에서 다시 읽는다.
 */
export async function requireActor(
  req: Request,
  roles?: UserRole[],
): Promise<Actor | NextResponse> {
  const actor = await resolveActor(req);
  if (actor instanceof NextResponse) return actor;

  if (roles && !roles.includes(actor.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  return actor;
}

async function resolveActor(req: Request): Promise<Actor | NextResponse> {
  const authorization = req.headers.get("authorization");

  // Authorization 이 어떤 스킴으로든 존재하면 토큰 경로로 확정한다.
  // 여기서 세션으로 폴백하면 "틀린 토큰 + 유효한 쿠키" 조합이 통과해 토큰 검증이 무의미해진다.
  if (authorization) return serviceActor(req, authorization);

  return sessionActor();
}

async function serviceActor(req: Request, authorization: string): Promise<Actor | NextResponse> {
  const expected = process.env.ADMIN_SERVICE_TOKEN;
  if (!expected) {
    // 조용히 401 로 두면 "콘솔이 왜 401이지?" 로 한나절을 태운다. 시끄럽게 실패한다.
    console.error("[authz] ADMIN_SERVICE_TOKEN 이 설정되지 않아 서비스 토큰 인증을 처리할 수 없습니다.");
    return NextResponse.json({ error: "서비스 토큰 미설정" }, { status: 503 });
  }

  // nginx 는 프록시하는 모든 요청에 X-Forwarded-For 를 세팅한다. 토큰 경로에서 이 헤더가
  // 보인다는 것은 공개 인터넷을 거쳐 왔다는 뜻이므로 거절한다. 콘솔은 루프백으로 부른다.
  if (process.env.ADMIN_SERVICE_TOKEN_LOOPBACK_ONLY !== "false" && req.headers.get("x-forwarded-for")) {
    console.warn("[authz] 외부 경유 요청이 서비스 토큰을 사용하려 했습니다.");
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match || !tokenMatches(match[1], expected)) {
    console.warn("[authz] 서비스 토큰이 일치하지 않습니다.");
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const email = (req.headers.get("x-actor-email") ?? "").trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json({ error: "X-Actor-Email 헤더가 필요합니다" }, { status: 400 });
  }

  // 없는 사용자를 만들어 주지 않는다. dicpress 계정이 먼저 있어야 콘솔에서 쓸 수 있다.
  const actor = await loadActiveActor({ email }, "service");
  if (!actor) {
    console.warn(`[authz] 서비스 토큰 요청의 대상 사용자가 없거나 비활성입니다: ${maskEmail(email)}`);
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  return actor;
}

async function sessionActor(): Promise<Actor | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  // 세션 JWT 에는 로그인 시점의 role 이 박혀 있다. 그대로 믿으면 강등·정지가
  // 세션 만료까지 반영되지 않으므로 여기서 DB 를 다시 읽는다.
  const actor = await loadActiveActor({ id: session.user.id }, "session");
  if (!actor) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  return actor;
}
