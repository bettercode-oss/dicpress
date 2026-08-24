@AGENTS.md

# dicpress — 프로젝트 가이드

## 프로젝트 개요

- **서비스**: BetterCode 사내 용어 사전 (https://dic.bizos.kr)
- **스택**: Next.js 16 App Router · Prisma · PostgreSQL · NextAuth v5 · PM2 · Cafe24 VPS
- **GitHub**: https://github.com/bettercode-oss/dicpress
- **PM2 프로세스명**: `dicpress` (package.json의 `name` 필드에서 자동 결정)

---

## 아키텍처

```
app/
  (public)/[slug]/   — 공개 문서 페이지 (ISR, revalidate=600)
  admin/             — 관리자 (NextAuth 세션 필요)
    login/           — 로그인 페이지
    (protected)/     — 문서 목록/편집
  api/
    entry/[slug]/    — 공개 API: { summary, title, content, contentHtml } (CORS *)
    public/          — 공개 API: 문서 색인 목록
    version/         — 빌드 정보 (force-dynamic)
    health/          — 헬스체크
    documents/       — 관리자 CRUD API

lib/
  authz.ts           — requireActor(req, roles?): 세션·서비스 토큰 공통 인증
  api/documents.ts   — listDocuments(): 라우트와 관리자 화면이 공유하는 문서 조회
  document-access.ts — 문서 접근 정책 (canAccessDocument / requireDocumentAccess / documentScope)
  entry-summary.ts   — getEntrySummary(), getEntry(), EntryData 타입
  markdown.ts        — markdownToReact(): rehype-react로 RSC 트리 반환
  build-info.ts      — NEXT_PUBLIC_* 빌드 메타 (버전, gitSha, buildTime)
  site.ts            — SITE_URL, SITE_NAME 환경변수
  webauthn.ts        — RP_ID/ORIGIN, challenge·토큰 발급/소비
  email.ts           — Resend 발송. mask.ts로 로그의 주소 마스킹

components/
  InternalLink.tsx   — async RSC: 내부 링크에 HelpTooltip 자동 부착
  HelpTooltip.tsx    — 클라이언트 컴포넌트 (Base UI Tooltip + DocModal 연동)
  DicTooltip.tsx     — 클라이언트 컴포넌트: keyword → /api/entry fetch → HelpTooltip
  DocModal.tsx       — 클라이언트 컴포넌트: 문서 전문 모달 (contentHtml 렌더)
  ui/tooltip.tsx     — shadcn/ui generated (Base UI @base-ui/react/tooltip)

constants/
  tooltips.ts        — 하드코딩 툴팁 (password 필드만 남음, 점진적 DicTooltip 전환 중)

docs/
  integration.md     — 외부 사이트 연동 가이드 (API 명세 + DicTooltip 패턴)
  admin-api.md       — 관리자 콘솔(admin.bizos.kr) 연동 계약
  decisions/         — ADR 문서
```

---

## 주요 설계 결정

### 마크다운 렌더링
`markdownToReact()` 사용 (dangerouslySetInnerHTML 미사용).
- 파이프라인: remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-highlight → rehype-react
- `a` 태그를 `InternalLink` (async RSC)로 교체해 내부 링크에 툴팁 자동 부착

### 툴팁 시스템 — 두 가지 경로

| 환경 | 컴포넌트 | 데이터 출처 |
|---|---|---|
| 서버 (마크다운 렌더러) | `InternalLink` → `getEntry()` → `HelpTooltip` | DB 직접 조회 |
| 클라이언트 (폼 등) | `DicTooltip` → `/api/entry/[slug]` fetch → `HelpTooltip` | HTTP API |

**툴팁 UX 흐름**:
1. `?` 아이콘 hover/tap → 요약(summary) 툴팁 표시
2. 툴팁 내 **"더 보기"** 클릭 → `DocModal` 오픈 (contentHtml 전문 표시)
3. ESC / 외부 클릭 → 모달 닫기

### 외부 사이트 API
`GET /api/entry/[slug]` — CORS `*` 허용, `s-maxage=300`.
응답: `{ summary, title, content, contentHtml }` (없으면 전부 null).
연동 가이드: `docs/integration.md` 참고.

### 진행 중 — 관리자 콘솔 연동 (Epic #68)

관리자 기능을 `admin.bizos.kr` 통합 콘솔(**저장소 `ahnyounghoe/admin`**, 이미 배포되어 도는
앱, 포트 3004)에서도 쓸 수 있게 하는 중이다. **자체 `/admin` UI 는 당분간 그대로 둔다** —
두 화면을 나란히 띄워 대조하는 기간을 거친 뒤에 닫는다.

- 콘솔은 **자체 DB(`admin_bizos`)와 자체 사용자·자체 Passkey** 를 가진다.
  dicpress User 와 콘솔 User 는 **다른 사람 목록**이다.
- 서비스 간 인증은 **고정 서비스 토큰**(`ADMIN_SERVICE_TOKEN`) + `X-Actor-Email` 헤더다.
  콘솔이 kbo-name-game 에 쓰는 방식과 같다. dicpress 는 그 이메일로 자기 User 를 찾아
  **매 요청 DB 에서 role/status 를 재확인**한다.
- 브라우저는 admin.bizos.kr 하고만 통신하고 그 서버가 루프백(`127.0.0.1:3001`)으로
  dicpress 를 호출한다(BFF). 따라서 **관리자 API 에 CORS 를 추가할 일은 없다.**
- **문서 쓰기는 계속 dicpress 안에서 일어나야 한다.** `revalidatePath` 는 호출한 프로세스의
  캐시만 무효화하므로, 콘솔이 Prisma 로 직접 쓰면 공개 목록(60초)·상세(600초)·
  사이트맵(3600초)이 그만큼 낡은 채로 남는다.
- **⚠️ 목록을 갱신하려면 `revalidatePath("/", "layout")` 이어야 한다.** 왼쪽 키워드 목록은
  `app/(public)/page.tsx` 가 아니라 **`app/(public)/layout.tsx`** 에서 조회하는데,
  `revalidatePath("/")` 는 기본 타입이 `'page'` 라 레이아웃 세그먼트를 건드리지 못한다.
  코드만 봐서는 드러나지 않고 로컬 dev 는 ISR 이 꺼져 있어 재현도 안 된다 —
  운영에서 실측해서야 찾았다(#74). 사이트맵은 라우트 핸들러라 별도로 호출해야 한다.
- 계약 문서는 `docs/admin-api.md`, 판단 근거는 `docs/decisions/002-admin-console-service-token.md`.

> ⚠️ **폐기된 설계에 주의.** 이슈 #63·#65·#68 본문은 콘솔이 아직 없던 시점에 쓰였다.
> 거기 적힌 **60초 actor JWT**, `/api/internal/session/exchange`, 저장소명
> `bettercode-oss/admin-console`, **WebAuthn RP ID 를 `bizos.kr` 로 전환(#65)** 은
> 모두 채택하지 않았다. ADR 002 가 현재 결정이다.

**WebAuthn RP ID 는 `dic.bizos.kr` 그대로 둔다.** 콘솔은 자체 RP ID 로 이미 로그인이
동작하므로 넓힐 이유가 없고, 넓히면 기존 Passkey 가 전부 무효화되어 전원 잠금 위험만 생긴다.

#### ⚠️ 토큰을 회전할 때 — 세 곳을 함께 바꾼다

`ADMIN_SERVICE_TOKEN` 은 같은 값이 세 곳에 있어야 한다.

| 위치 | 무엇 | 안 바꾸면 |
|---|---|---|
| 서버 `/var/www/dic.bizos.kr/.env.production`<br>**+ `.next/standalone/.env.production` 사본** | 앱이 실제로 읽는 값 | 콘솔 호출이 401. 사본을 빠뜨리면 재빌드 전까지 옛 값이 산다 (standalone 함정) |
| GitHub 리포지토리 시크릿 `ADMIN_SERVICE_TOKEN` | 배포 후 경계 스모크 체크 | **거짓 정상** — 아래 참고 |
| 콘솔 `ahnyounghoe/admin` 서버 `.env` 의 `DICPRESS_SERVICE_TOKEN` | 콘솔 커넥터 | 콘솔에서 dicpress 가 전부 401 |

**시크릿만 안 바꾸면 조용히 망가진다.** 스모크 체크(`scripts/verify-auth-boundary.sh`)는
"유효한 토큰을 공개 URL 로 보내 401 이면 정상" 이라는 역방향 판정이다. 시크릿이 서버와 다르면
nginx 가 헤더를 통과시키더라도 토큰 불일치로 401 이 나와 **경계가 뚫린 채로 초록불**이 켜진다.
스크립트가 값의 존재와 최소 길이는 확인하지만, "서버와 같은 값인가" 는 밖에서 알 수 없다.

서버 값을 화면에 띄우지 않고 꺼내려면:

```bash
ssh root@<서버> "sed -n 's/^ADMIN_SERVICE_TOKEN=\"\(.*\)\"$/\1/p' /var/www/dic.bizos.kr/.env.production" | tr -d '\n' | pbcopy
```

#### 관찰 — 발행 직후 목록이 드물게 낡아 보일 수 있다

#75 검증 중 **10회 중 1회** 나타났다. 발행 직후 공개 목록에 새 문서가 없다가, 다음 쓰기나
60초(레이아웃 `revalidate`) 안에 나타났다.

- **원인은 확인하지 못했다.** ISR 의 좁은 경쟁 구간으로 추정한다 — 페이지 재생성이 진행 중일 때
  그 캐시 쓰기가 `revalidatePath` 무효화보다 늦게 안착하면 낡은 항목이 되살아난다.
  나타난 1회는 prime 과 발행 사이 간격이 80ms 로 가장 짧았다.
- **재현에 실패했다.** 간격을 0~3초로 바꾼 4종, 캐시 miss 유도 4회, 원래 순서 재현 2회 —
  **10회 연속 통과**했다. 조건문 로직 문제는 아니다(발행과 삭제가 같은 코드 경로인데
  삭제는 통과했다).
- **자가 치유된다.** 다음 쓰기나 60초 안에 정상화된다.

**단정하지 말고 관찰로 읽을 것.** 이 항목의 목적은 나중에 같은 것을 목격한 사람이
처음부터 다시 파는 것을 막는 데 있다. 재현 방법을 찾았다면 여기를 갱신한다.

### summary 추출 전략
`Document.summary` 필드 우선 → 없으면 `contentMd`에서 자동 추출.
- 줄 단위 순회: heading(`#`) 줄·코드 펜스 내부 건너뜀
- 단일 `\n` 구조(빈 줄 없는 문서)도 정상 처리
- 최대 150자, 초과 시 `…` 추가

### CMS 관리 툴팁 (DicTooltip)
- 로그인 이메일 필드: `<DicTooltip keyword="email-only" />` → `email-only` 슬러그 문서
- 로그인 비밀번호 필드: 향후 `password-only` 슬러그 문서로 전환 예정 (#37)
- `constants/tooltips.ts`는 미전환 항목만 임시 보관

### 관리자 인증
NextAuth v5 Credentials provider. `trustHost: true` (auth.config.ts).
PM2 `env_production`에 `AUTH_TRUST_HOST: "true"` 설정 필수 (역방향 프록시 환경).

**⚠️ 미들웨어는 API를 보호하지 않는다.** `proxy.ts`(Next 16에서 `middleware.ts`가 개명된 것)의
matcher가 `api`를 제외하므로, **모든 API 라우트는 스스로 인증을 검사해야 한다.**
새 라우트를 만들 때 `lib/authz.ts`의 `requireActor()`를 쓴다.

```ts
const actor = await requireActor(req, ["OWNER", "ADMIN"]); // roles 생략 시 로그인만 확인
if (actor instanceof NextResponse) return actor;
```

세션과 서비스 토큰 **양쪽**을 받고, 어느 경로든 매 요청 DB에서 `role`·`status`를 다시 읽는다.
서버 컴포넌트에서는 `Request`가 없으므로 `getSessionActor()`를 쓴다.

문서를 다루는 라우트는 `lib/document-access.ts`도 함께 쓴다 —
**OWNER/ADMIN은 전체 문서, AUTHOR는 본인 문서만**이 유일한 정책 지점이다.
사용자가 보낸 `authorId` 같은 신원 값은 절대 신뢰하지 않고 세션에서 가져온다.

### 빌드 버전
CI가 빌드 전 환경변수 주입:
- `NEXT_PUBLIC_GIT_SHA` / `NEXT_PUBLIC_BUILD_TIME` / `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_REPO_URL`
- 관리자 푸터에서 버전·gitSha(GitHub 커밋 링크)·빌드 시각 표시

---

## 개발 워크플로우

### 이슈 우선 원칙
**반드시 이슈를 먼저 만들고 작업 시작.** 커밋 메시지에 `Closes #N` 포함.

```bash
gh issue create --title "..." --body "..."
# 작업 후
git commit -m "feat: ... Closes #N"
```

### 로컬 개발

```bash
npm run dev          # Next.js 개발 서버
npx prisma studio    # DB GUI
npx tsc --noEmit     # 타입 체크
npm run lint         # ESLint
```

### CI/CD
`main` 브랜치 push → GitHub Actions 자동 실행:
1. TypeScript 체크 + ESLint (PR/push 모두)
2. SSH로 Cafe24 서버 접속 → `git fetch origin main && git reset --hard origin/main` → npm ci → prisma migrate deploy → build → PM2 reload (main push만)
3. `/api/version` 엔드포인트로 배포 SHA 검증

GitHub Secrets 필요: `SSH_HOST`, `SSH_USER`(root), `SSH_PRIVATE_KEY`(배포 전용 키), `SSH_PORT`, `DEPLOY_PATH`, `PORT`

---

## 서버 운영

```bash
# 프로세스 상태
pm2 status

# 재시작 (무중단)
pm2 reload dicpress

# 최초 기동 (배포 직후 또는 서버 재부팅 후)
pm2 start ecosystem.config.js --env production

# 로그 확인
pm2 logs dicpress --lines 50
```

`ecosystem.config.js`는 `__dirname` 기반 절대 경로 사용 — 환경변수 `DEPLOY_PATH` 불필요.

### ⚠️ nginx 설정은 CI가 반영하지 않는다

> **템플릿 수정 = 서버 반영이 아니다.**
> `deploy/nginx.conf.template`을 고치고 커밋·push·배포까지 끝내도
> 서버의 nginx는 **아무것도 달라지지 않는다.** 반드시 서버에서 직접 고쳐야 한다.

`deploy/nginx.conf.template`은 `deploy/setup.sh`가 **최초 1회만** 읽어
`/etc/nginx/sites-available/$DOMAIN`을 만든다. 그 뒤로 둘은 갈라진 두 파일이고,
CI 배포(`.github/workflows/deploy.yml`)는 nginx를 건드리지 않는다.
저장소의 템플릿은 **새 서버를 세울 때 쓰는 원본**일 뿐, 운영 중인 설정의 사본이 아니다.

즉 nginx를 바꾸려면 **항상 두 곳을 고친다**:

1. 저장소 `deploy/nginx.conf.template` — 다음에 세울 서버를 위해
2. 서버 `/etc/nginx/sites-available/$DOMAIN` — 지금 도는 서버를 위해

```bash
vi /etc/nginx/sites-available/dic.bizos.kr
nginx -t && systemctl reload nginx
```

`nginx -t` 없이 reload하지 말 것 — 문법 오류면 nginx가 뜨지 않아 사이트 전체가 죽는다.

**서버에 아직 반영되지 않은 항목** (반영했으면 지운다):
- `location /uploads/` 의 `alias` 를 `$UPLOAD_DIR/` 로 — 아래 「업로드 파일은 배포 밖에 둔다」

2026-08-25 확인: `client_max_body_size 10m`(#61)과 `proxy_set_header Authorization "";`(#70)은
서버에 **이미 들어가 있다.** 이 목록에 남아 있었으나 사실이 아니어서 지웠다.

### ⚠️ 업로드 파일은 배포 밖에 둔다 (#90)

바로 아래 「standalone 빌드의 함정」과 **뿌리가 같다.** `server.js` 가
`process.chdir(__dirname)` 을 하므로 운영에서 `process.cwd()` 는 저장소 루트가 아니라
`.next/standalone` 이다. 그 사실이 환경변수 쪽으로만 적혀 있어서, 업로드가 같은 이유로
깨져 있는 것을 오래 아무도 몰랐다.

`app/api/upload/route.ts` 는 예전에 `path.join(process.cwd(), "public", "uploads")` 에 썼다.
운영에서 그 자리는 `.next/standalone/public/uploads/` 였고 nginx 는
`${DEPLOY_PATH}/public/uploads/` 를 보고 있었다. **업로드는 201, 그 URL 은 404.**
게다가 그 자리는 배포마다 사라진다 — `npm run build` 가 standalone 출력을 새로 쓰고
`deploy.yml` 이 `cp -r public .next/standalone/public` 으로 다시 만든다.

그래서 저장 위치를 **빌드 산출물 밖의 절대 경로**로 뺐다. 세 곳이 같은 값이어야 한다.

| 곳 | 무엇 |
|---|---|
| 서버 `.env.production` | `UPLOAD_DIR=/var/lib/dicpress/uploads` (+ standalone 사본 갱신, 아래 절) |
| 서버 `/etc/nginx/sites-available/dic.bizos.kr` | `location /uploads/` 의 `alias` |
| 저장소 `deploy/project.conf` · `nginx.conf.template` | 다음에 세울 서버를 위해 |

- **`DEPLOY_PATH` 아래에 두지 않는다.** 배포가 `git reset --hard` 하고 `.next` 를 새로
  빌드하므로 그 안이면 사용자가 올린 파일이 배포마다 사라진다
- **상대 경로로 두지 않는다.** cwd 함정으로 그대로 돌아간다. 앱이 기동 로그에 경고를 남긴다
- **공개 URL 은 그대로 `/uploads/…` 다.** 저장 위치가 바뀌어도 `contentMd` 에 박힌 값은
  건드릴 필요가 없다 — 둘을 잇는 것은 nginx 의 `alias` 다

로컬은 설정하지 않아도 된다. `next dev` 의 cwd 가 저장소 루트고 Next 가 `public/` 을
직접 서빙하므로 기본값(`public/uploads`)으로 그대로 돈다.

### ⚠️ 환경변수를 손으로 바꿀 때 (standalone 빌드의 함정)

`output: "standalone"` 빌드는 **빌드 시점에 `.env.production`을 `.next/standalone/`으로 복사**하고,
`server.js`가 시작할 때 `process.chdir(__dirname)`으로 이동해 **그 사본을 읽는다.**
프로젝트 루트의 `.env.production`만 고치면 아무 일도 일어나지 않는다.

```bash
cd /var/www/dic.bizos.kr
vi .env.production                              # 1) 원본 수정
cp .env.production .next/standalone/.env.production   # 2) 사본 갱신 ← 빠뜨리기 쉬움
pm2 restart dicpress                            # 3) 재시작
```

재빌드(`npm run build`)를 하면 2번은 자동으로 처리된다. CI 배포는 빌드를 돌리므로 문제없다.

또한 **`pm2 reload`는 프로세스 환경변수를 갱신하지 않는다**(`Use --update-env...` 경고가 그 뜻).
PM2가 예전에 주입해 둔 값이 있으면 Next의 `loadEnvConfig`가 덮어쓰지 않으므로 그 값이 이긴다.
PM2 주입값을 확인·제거하려면:

```bash
tr '\0' '\n' < /proc/$(pm2 pid dicpress)/environ | grep -i <변수명>
pm2 delete dicpress && pm2 start ecosystem.config.js --env production && pm2 save
```

비밀값은 `ecosystem.config.js`에 넣지 않는다 — 이 파일은 커밋 대상이라 저장소에 남는다.
서버 `.env.production`이 올바른 위치다(`.gitignore` 대상이라 `git reset --hard`로 지워지지 않는다).

---

## 마일스톤 현황

| 마일스톤 | 상태 |
|---|---|
| M1 - dogfooding | 완료 (#32, #37 종료) |
| M2 - 외부 사이트 적용 | 진행 중 (open 3) |
| M3 - 권한 체계와 Passkey 적용 | 완료 (closed 12) |
| M4 - 관리자 콘솔 연동 | 진행 중 (Epic #68, 방식은 ADR 002로 변경) |

### M2 오픈 이슈
- **#1** Passkey 사용을 낯설어 하는 사용자를 위한 도움말 제공
- **#10** ordera.bettercode.kr/signin 적용 (ordera 프로젝트 필요)
- **#11** ordera.libaitian.kr/signin 적용 (ordera 프로젝트 필요)

### M4 오픈 이슈
- **#70** 콘솔이 쓸 서비스 토큰 인증 — 자체 UI와 병행 (**현재 작업**)
- **#68** Epic — 본문의 actor JWT·저장소명 전제가 낡았다. ADR 002가 현재 결정이다
- **#63** Phase 1 — #70이 대체한다
- **#64** Phase 2 — 콘솔은 이미 배포됐다(2026-08-22). 사실상 완료
- **#65** Phase 3 — **하지 않는다.** 근거는 ADR 002
- **#66** Phase 4 — 콘솔 쪽 화면 이식. 저장소 `ahnyounghoe/admin#8`
- **#67** Phase 5: 컷오버 — dicpress 관리자 표면 닫기. 병행 운영 검증 이후

### 마일스톤 밖 오픈 이슈
- **#51** 등록 링크 재발송 기능 (#65 의 CLI 초대 스크립트와 겹침)
- **#60** Resend SDK 자체 console.error 가 maskEmails() 를 우회함

---

## 환경 변수

| 변수 | 용도 | 위치 |
|---|---|---|
| `DATABASE_URL` | Prisma DB 연결 | `.env` |
| `NEXTAUTH_SECRET` | NextAuth 서명. v5는 `AUTH_SECRET`을 먼저 보고 이 이름으로 폴백한다 | `.env` |
| `NEXT_PUBLIC_SITE_URL` | SITE_URL (내부 링크 판별) | `.env` |
| `NEXT_PUBLIC_SITE_NAME` | 사이트 표시명 | `.env` |
| `AUTH_TRUST_HOST` | NextAuth 프록시 신뢰 | PM2 env_production |
| `RESEND_API_KEY` | Resend 이메일 발송 | `.env` (서버에도 필요) |
| `RESEND_FROM` | 발신 주소 — 인증된 도메인이어야 함 | `.env` (서버에도 필요) |
| `ADMIN_SERVICE_TOKEN` | 관리자 콘솔의 서버 간 호출 인증. **이 토큰은 사실상 OWNER 권한이다** | `.env` (서버에도 필요) |
| `NEXT_PUBLIC_GIT_SHA` 외 3개 | 빌드 버전 표시 | CI 빌드 시 주입 |
