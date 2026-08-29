/**
 * 로컬 개발용 계정 픽스처.
 *
 * ## 무엇을 위한 스크립트인가
 *
 * 권한 정책은 **역할과 상태의 조합**으로만 확인할 수 있다 — AUTHOR 가 사용자 API 에서
 * 403 을 받는지, SUSPENDED 로 바뀐 사람이 다음 호출에서 거부되는지 같은 것들이다.
 * 운영에는 OWNER 한 명뿐이고 그 한 명은 **설계상 자기 자신을 정지·강등할 수 없으므로**
 * (`docs/admin-api.md` 「대상 규칙」), 그 시나리오들은 로컬에서만 돌릴 수 있다 (#66).
 *
 * 그래서 이 파일이 만드는 것은 "관리자 한 명" 이 아니라 **시험용 계정 한 벌**이다.
 *
 * ## 컷오버 뒤에는 이것이 유일한 계정 생성 수단이 된다
 *
 * #67 이 dicpress 의 로그인·`setup` 화면을 걷어내면 로컬에서 계정을 만들 다른 방법이
 * 없어진다. 그래서 이 스크립트는 **로그인 관련 의존성 없이도 동작해야 한다** —
 * `bcryptjs` 는 선택적으로만 쓴다(아래 `hashPassword`).
 */
import { config } from "dotenv";

// ⚠️ 순서가 중요하다. dotenv 는 **이미 설정된 값을 덮지 않으므로**, 먼저 읽은 파일이 이긴다.
// 예전에는 `.env.production` 을 먼저 읽었다. 그 파일이 있으면 OWNER 를 만드는 이 스크립트가
// 기본으로 운영 DB 를 겨눴다는 뜻이다. 로컬용 파일을 먼저 읽고, 운영을 겨누는 것은
// 아래 guard 에서 명시적으로만 허용한다.
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient, type UserRole, type UserStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** 만들 계정 한 벌. 역할×상태 조합을 덮는다. */
type Fixture = {
  key: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /** 이 계정에만 비밀번호를 심는다. dicpress 자체 로그인 화면용이고 컷오버와 함께 사라진다. */
  withPassword?: boolean;
};

const OWNER_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "owner@example.com";

/**
 * 이메일은 **소문자**로 만든다. `lib/authz.ts` 가 `X-Actor-Email` 을 소문자로 정규화한 뒤
 * 정확히 일치로 조회하므로, 대문자가 섞여 저장되면 콘솔에서 조용히 403 이 난다.
 */
const FIXTURES: Fixture[] = [
  { key: "owner", email: OWNER_EMAIL, name: "Owner", role: "OWNER", status: "ACTIVE", withPassword: true },
  { key: "admin", email: "admin@example.com", name: "Admin", role: "ADMIN", status: "ACTIVE" },
  { key: "author", email: "author@example.com", name: "Author", role: "AUTHOR", status: "ACTIVE" },
  { key: "suspended", email: "suspended@example.com", name: "Suspended", role: "AUTHOR", status: "SUSPENDED" },
];

/**
 * 로컬 DB 인지 확인한다. **이 스크립트는 OWNER 를 만든다** — 겨눈 곳이 어디인지 틀리면
 * 그 자체가 사고다.
 *
 * 운영을 겨눠야 하는 정당한 경우(새 서버 부트스트랩)가 있을 수 있으므로 막지 않고
 * `SEED_ALLOW_REMOTE=1` 로 열어 둔다. 다만 **기본값은 거절**이다.
 */
function assertLocalDatabase(url: string) {
  if (process.env.SEED_ALLOW_REMOTE === "1") {
    console.warn("[seed] SEED_ALLOW_REMOTE=1 — 원격 DB 를 허용합니다. 겨눈 곳을 확인하세요.");
    return;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`[seed] DATABASE_URL 을 해석하지 못했습니다: ${url.slice(0, 20)}…`);
  }

  const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
  if (!local.includes(host)) {
    throw new Error(
      `[seed] DATABASE_URL 이 로컬이 아닙니다(host=${host}). ` +
        "이 스크립트는 OWNER 계정을 만듭니다. 의도한 것이라면 SEED_ALLOW_REMOTE=1 을 붙이세요.",
    );
  }
}

/**
 * 비밀번호 해싱. **없으면 없는 대로 진행한다.**
 *
 * 비밀번호는 dicpress 자체 로그인 화면(`Credentials` provider)에서만 쓰인다. #67 컷오버가
 * 그 화면과 `bcryptjs` 의존성을 함께 제거하는데, 그때도 이 스크립트는 계정을 만들 수 있어야
 * 한다. 그래서 정적 import 대신 동적 import 를 쓰고, 실패하면 비밀번호 없이 만든다.
 *
 * **컷오버 때 할 일**: `bcryptjs` 를 지우면서 이 함수와 `withPassword` 필드도 함께 지운다.
 */
async function hashPassword(plain: string): Promise<string | null> {
  try {
    const bcrypt = await import("bcryptjs");
    return await bcrypt.default.hash(plain, 12);
  } catch {
    console.warn(
      "[seed] bcryptjs 가 없어 비밀번호를 건너뜁니다. 계정은 그대로 만들어집니다 — " +
        "콘솔(X-Actor-Email)로 쓰는 데는 비밀번호가 필요 없습니다.",
    );
    return null;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[seed] DATABASE_URL 이 없습니다. .env 를 확인하세요.");
  assertLocalDatabase(url);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  // 비밀번호는 있으면 심고 없으면 넘어간다. 콘솔로만 쓸 거라면 설정할 이유가 없다.
  const plain = process.env.ADMIN_PASSWORD;
  const hash = plain ? await hashPassword(plain) : null;
  if (!plain) {
    console.log("[seed] ADMIN_PASSWORD 가 없어 비밀번호 없이 만듭니다 (콘솔 경로에는 불필요).");
  }

  try {
    for (const f of FIXTURES) {
      const email = f.email.toLowerCase();
      const password = f.withPassword ? hash : null;

      // 역할·상태는 **매번 맞춘다.** 시험 중 바꿔 놓은 값이 남아 있으면 다음 시나리오가
      // 조용히 다른 전제로 돌아간다. 픽스처는 재실행이 곧 초기화여야 한다.
      const user = await prisma.user.upsert({
        where: { email },
        update: { role: f.role, status: f.status, name: f.name, ...(password ? { password } : {}) },
        create: { email, name: f.name, role: f.role, status: f.status, ...(password ? { password } : {}) },
      });

      console.log(`  ${user.email.padEnd(28)} ${user.role.padEnd(6)} ${user.status}`);
    }

    console.log(
      "\n[seed] 완료. 콘솔에서 쓰려면 로그인 이메일을 위 계정 중 하나와 맞추거나,\n" +
        "       콘솔 로컬 .env.local 의 DICPRESS_ACTOR_EMAIL 로 지정하세요(로컬 전용 탈출구).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
