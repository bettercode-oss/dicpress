import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { maskEmail } from "@/lib/mask";
import { normalizeEmail, MAX_EMAIL_LENGTH } from "@/lib/email-address";
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

/**
 * 서비스 토큰의 최소 길이.
 *
 * 이 토큰은 사실상 OWNER 권한이라(파일 상단 「신뢰 경계」 참고) 짧은 값을 허용할 이유가 없다.
 * `openssl rand -base64 48` 이 64자를 준다. 32자는 "실수로 짧게 넣은 것"을 걸러내는 하한이다.
 */
const MIN_TOKEN_LENGTH = 32;

/**
 * 서비스 토큰 경로를 쓸 수 있는지 **기동 시 한 번** 판정한다.
 *
 * 매 요청 `process.env` 를 다시 읽지 않는 이유는 두 가지다. 판정이 요청마다 흔들리지 않고,
 * 경고를 요청마다 찍지 않는다. 값이 없거나 부실하면 그 경로는 **영구 비활성**이고
 * 어떤 `Authorization` 헤더도 통과하지 못한다.
 *
 * 여기서 죽지 않는다. 서비스 토큰이 없다고 앱을 못 뜨게 하면 자체 관리자 UI 까지 같이
 * 죽는다 — 그건 콘솔 연동이 안 되는 것보다 훨씬 큰 사고다. 세션 경로는 그대로 산다.
 */
const SERVICE_TOKEN: string | null = (() => {
  const raw = process.env.ADMIN_SERVICE_TOKEN?.trim();

  if (!raw) {
    console.warn(
      "[authz] ADMIN_SERVICE_TOKEN 이 없습니다. 관리자 콘솔(admin.bizos.kr) 연동이 비활성화됩니다. " +
        "자체 관리자 UI 는 세션으로 정상 동작합니다.",
    );
    return null;
  }

  if (raw.length < MIN_TOKEN_LENGTH) {
    // 길이만 말한다. 값은 절대 싣지 않는다.
    console.warn(
      `[authz] ADMIN_SERVICE_TOKEN 이 너무 짧습니다(${raw.length}자, 최소 ${MIN_TOKEN_LENGTH}자). ` +
        "관리자 콘솔 연동을 비활성화합니다. openssl rand -base64 48 로 다시 만드세요.",
    );
    return null;
  }

  return raw;
})();

/**
 * 서비스 토큰을 비교한다.
 *
 * 양쪽을 sha256 으로 해싱해 **고정 32바이트**로 맞춘 뒤 비교한다. `timingSafeEqual` 은 길이가
 * 다르면 `RangeError` 를 던지는데, 그게 500 으로 나가면 그 자체가 "길이가 다르다"는 오라클이
 * 된다. 해싱하면 예외도 길이 누설도 함께 사라진다 — 길이 선검사보다 이쪽이 낫다.
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
 * 앱 안에서 "루프백에서 온 요청인가" 를 판별하려 하지 말 것. `X-Forwarded-For` 는
 * 클라이언트가 보낸 값이 그대로 전달되므로(Next 개발 서버에서 실측) 위조할 수 있고,
 * 그걸로 만든 가드는 막아 주는 것 없이 안전하다는 착각만 준다.
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
  // 토큰이 없거나 부실하면 이 경로는 존재하지 않는 것과 같다. 유효한 자격 증명이 있을 수
  // 없으므로 401 이 정직한 답이다. 503 은 "여기 토큰 경로가 있는데 설정이 틀렸다" 를 밖에
  // 알려 줄 뿐이다 — 진단은 기동 시 경고 로그가 이미 하고 있다.
  if (!SERVICE_TOKEN) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match || !tokenMatches(match[1], SERVICE_TOKEN)) {
    console.warn("[authz] 서비스 토큰이 일치하지 않습니다.");
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  // 이메일은 소문자로 정규화한다. Postgres 의 `=` 는 대소문자를 구분하므로, 콘솔이
  // `Kim@x.com` 을 보내고 DB 에 `kim@x.com` 이 있으면 조용히 403 이 난다.
  //
  // `mode: "insensitive"` + `findFirst` 로 푸는 방법은 쓰지 않는다. 대소문자만 다른 두 행이
  // 있으면 어느 쪽이 잡힐지 비결정적이고, 그 자체가 권한 우회 벡터가 된다.
  //
  // 정규화의 정의는 `lib/email-address.ts` 한 곳에 있다. 저장 쪽도 같은 함수를 쓴다 —
  // 예전에는 여기(읽기)에만 있어서, 대소문자가 섞여 저장되면 승인된 계정이 영구 403 이
  // 되는 함정이 있었다 (#105).
  const email = normalizeEmail(req.headers.get("x-actor-email"));
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

/**
 * 세션만으로 Actor 를 얻는다. **서버 컴포넌트 전용.**
 *
 * 관리자 화면은 `Request` 를 손에 쥐고 있지 않고, 애초에 서비스 토큰으로 들어올 수도 없다.
 * 라우트 핸들러는 `requireActor()` 를 쓴다.
 */
export async function getSessionActor(): Promise<Actor | null> {
  const actor = await sessionActor();
  return actor instanceof NextResponse ? null : actor;
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
