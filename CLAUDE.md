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
    entry/[slug]/    — 공개 API: 외부 사이트용 entry summary (CORS *)
    public/          — 공개 API: 문서 색인 목록
    version/         — 빌드 정보 (force-dynamic)
    health/          — 헬스체크
    documents/       — 관리자 CRUD API

lib/
  entry-summary.ts   — getEntrySummary(slug): React.cache() 감싸진 DB 조회
  markdown.ts        — markdownToReact(): rehype-react로 RSC 트리 반환
  build-info.ts      — NEXT_PUBLIC_* 빌드 메타 (버전, gitSha, buildTime)
  site.ts            — SITE_URL, SITE_NAME 환경변수

components/
  InternalLink.tsx   — async RSC: 내부 링크에 HelpTooltip 자동 부착
  help-tooltip.tsx   — HelpTooltip 클라이언트 컴포넌트 (Base UI Tooltip)
  ui/tooltip.tsx     — shadcn/ui generated (Base UI @base-ui/react/tooltip)
```

---

## 주요 설계 결정

### 마크다운 렌더링
`markdownToReact()` 사용 (dangerouslySetInnerHTML 미사용).
- 파이프라인: remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-highlight → rehype-react
- `a` 태그를 `InternalLink` (async RSC)로 교체해 내부 링크에 툴팁 자동 부착
- `rehype-react`가 React 트리를 직접 생성하므로 XSS 위험 없음

### 내부 링크 툴팁
`InternalLink` → `getEntrySummary(slug)` → DB 조회 → `HelpTooltip` 렌더.
- `getEntrySummary`는 `React.cache()`로 같은 요청 내 중복 DB 조회 제거
- 비공개/없는 문서면 툴팁 미표시 (summary: null)
- summary 우선순위: `Document.summary` 필드 → contentMd 첫 문단 추출(최대 150자)

### 외부 사이트 API
`GET /api/entry/[slug]` — CORS `*` 허용, `s-maxage=300`.
외부 사이트에서 `fetch("https://dic.bizos.kr/api/entry/passkey")` 형태로 호출.

### 관리자 인증
NextAuth v5 Credentials provider. `trustHost: true` (auth.config.ts).
PM2 `env_production`에 `AUTH_TRUST_HOST: "true"` 설정 필수 (역방향 프록시 환경).

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

---

## 마일스톤 현황

| 마일스톤 | 상태 |
|---|---|
| M1 - dogfooding | 완료 (6/6 이슈) |
| M2 - 외부 사이트 적용 | 진행 중 (1/4 이슈 완료) |

### M2 오픈 이슈
- **#1** Passkey 사용을 낯설어 하는 사용자를 위한 도움말 제공 (dic.bizos.kr/passkey 연결)
- **#10** ordera.bettercode.kr/signin 에 패스키 로그인 툴팁 적용
- **#11** ordera.libaitian.kr/signin 에 패스키 로그인 툴팁 적용

#10, #11은 ordera 프로젝트 코드 변경 필요 (dic 레포 외부).

---

## 환경 변수

| 변수 | 용도 | 위치 |
|---|---|---|
| `DATABASE_URL` | Prisma DB 연결 | `.env` |
| `AUTH_SECRET` | NextAuth 서명 | `.env` |
| `NEXT_PUBLIC_SITE_URL` | SITE_URL (내부 링크 판별) | `.env` |
| `NEXT_PUBLIC_SITE_NAME` | 사이트 표시명 | `.env` |
| `AUTH_TRUST_HOST` | NextAuth 프록시 신뢰 | PM2 env_production |
| `NEXT_PUBLIC_GIT_SHA` 외 3개 | 빌드 버전 표시 | CI 빌드 시 주입 |
