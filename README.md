# dicpress

키워드 중심의 사전식 지식 아카이브를 직접 운영할 수 있는 셀프호스팅 퍼블리싱 앱입니다.

- **공개 페이지** — 좌측 키워드 목록 + 우측 본문의 2단 사전형 레이아웃
- **관리자** — 마크다운 에디터(실시간 프리뷰), 문서 CRUD, 버전 관리, 이미지 업로드

## 스택

- [Next.js 16](https://nextjs.org) (App Router, standalone 빌드)
- [PostgreSQL](https://www.postgresql.org) + [Prisma 7](https://www.prisma.io)
- [NextAuth v5](https://authjs.dev)
- PM2 + Nginx (프로덕션)

## 로컬 개발

### 사전 준비

- Node.js 22+
- PostgreSQL 14+

### 설치

```bash
git clone https://github.com/bettercode-oss/dicpress.git
cd dicpress
npm ci
```

### 환경변수 설정

```bash
cp .env.production.example .env
```

`.env` 를 열어 실제 값으로 채웁니다.

```env
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_NAME="my-site"

DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dicpress?schema=public"

NEXTAUTH_SECRET="..."        # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="strong-password"
```

### DB 초기화 및 실행

```bash
npm run db:migrate   # 마이그레이션
npm run db:seed      # 관리자 계정 생성
npm run dev          # 개발 서버 시작
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 로 접속합니다.  
관리자 페이지는 [http://localhost:3000/admin](http://localhost:3000/admin) 입니다.

## 프로덕션 배포 (PM2 + Nginx)

### 사전 준비 (서버)

- Node.js 22+
- PostgreSQL 14+
- PM2 (`npm install -g pm2`)
- Nginx
- SSL 인증서 (Let's Encrypt 권장)

### 초기 세팅 (최초 1회)

서버에 repo가 아직 없으므로 임시 위치에 먼저 클론합니다.

```bash
git clone https://github.com/bettercode-oss/dicpress.git /tmp/dicpress
cd /tmp/dicpress
```

`deploy/project.conf` 를 생성하고 편집합니다.

```bash
cp deploy/project.conf.example deploy/project.conf
nano deploy/project.conf
```

```bash
APP_NAME="dicpress"
DOMAIN="your-domain.example.com"
DEPLOY_PATH="/var/www/your-domain.example.com"
PORT=3001
REPO_URL="https://github.com/bettercode-oss/dicpress.git"
```

`ecosystem.config.js` 상단 config 블록도 동일하게 수정합니다.

```bash
nano ecosystem.config.js
```

세팅 스크립트를 실행합니다.

```bash
bash deploy/setup.sh
```

스크립트가 다음을 순서대로 실행합니다.

1. 앱 디렉토리 생성 및 리포 클론 (`DEPLOY_PATH` 로)
2. `.env.production` 생성 후 **편집기 자동 실행** (값 입력 후 저장)
3. 의존성 설치 및 빌드
4. DB 마이그레이션 및 시드
5. Nginx 설정 생성 및 적용
6. PM2로 앱 시작

완료 후 임시 클론을 정리합니다.

```bash
rm -rf /tmp/dicpress
```

### CI/CD (GitHub Actions)

`main` 브랜치에 push 하면 자동으로 서버에 무중단 배포됩니다.  
GitHub 리포 → Settings → Secrets 에 아래 값을 등록하세요.

| Secret | 내용 |
|--------|------|
| `SSH_HOST` | 서버 IP 또는 호스트명 |
| `SSH_USER` | SSH 접속 계정 |
| `SSH_PRIVATE_KEY` | SSH 개인키 |
| `SSH_PORT` | SSH 포트 (기본 22) |
| `DEPLOY_PATH` | 서버의 배포 경로 |

## 환경변수 전체 목록

| 변수 | 설명 | 예시 |
|------|------|------|
| `NEXT_PUBLIC_SITE_URL` | 사이트 전체 URL (빌드 시 결정) | `https://example.com` |
| `NEXT_PUBLIC_SITE_NAME` | 사이트 표시 이름 (빌드 시 결정) | `example.com` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://...` |
| `NEXTAUTH_SECRET` | 세션 암호화 키 | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 인증 콜백 기준 URL | `https://example.com` |
| `ADMIN_EMAIL` | 관리자 이메일 (시드용) | `admin@example.com` |
| `ADMIN_PASSWORD` | 관리자 비밀번호 (시드용) | 강력한 비밀번호 |

## 라이선스

MIT
