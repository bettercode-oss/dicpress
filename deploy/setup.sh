#!/usr/bin/env bash
# 서버 첫 배포 시 한 번만 실행하는 초기 세팅 스크립트
# 사용법: bash deploy/setup.sh
set -euo pipefail

# ── 프로젝트 설정 로드 ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/project.conf
source "$SCRIPT_DIR/project.conf"
# ─────────────────────────────────────────────────────────────────────

echo "▶ 앱 디렉토리 생성..."
sudo mkdir -p "$DEPLOY_PATH"
sudo chown "$USER:$USER" "$DEPLOY_PATH"

echo "▶ GitHub에서 클론..."
git clone "$REPO_URL" "$DEPLOY_PATH"
cd "$DEPLOY_PATH"
cp "$REPO_ROOT/.env.production" .env.production

echo "▶ .env.production 확인..."
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
if [[ ! -f "$REPO_ROOT/.env.production" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  오류: .env.production 파일이 없습니다."
  echo ""
  echo "  setup.sh 실행 전에 아래 명령으로 파일을 직접 작성하세요:"
  echo ""
  echo "    cp .env.production.example .env.production"
  echo "    nano .env.production"
  echo ""
  echo "  DATABASE_URL, NEXTAUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD 등"
  echo "  실제 값을 채운 후 다시 setup.sh 를 실행하세요."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi

echo "▶ 의존성 설치..."
npm ci

echo "▶ Prisma 클라이언트 생성..."
npx prisma generate

echo "▶ DB 마이그레이션 & 시드..."
npx prisma migrate deploy
npm run db:seed

echo "▶ 빌드..."
npm run build

echo "▶ standalone 정적 파일 복사..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "▶ 업로드 디렉토리 및 로그 디렉토리 생성..."
mkdir -p public/uploads logs

echo "▶ Nginx 설정 생성..."
export APP_NAME DOMAIN DEPLOY_PATH PORT
envsubst '${APP_NAME} ${DOMAIN} ${DEPLOY_PATH} ${PORT}' \
    < "$DEPLOY_PATH/deploy/nginx.conf.template" \
    | sudo tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null
sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t && sudo systemctl reload nginx
echo "  → /etc/nginx/sites-available/$DOMAIN 생성 완료"

echo "▶ PM2로 앱 시작..."
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

echo ""
echo "✅ 초기 세팅 완료 ($APP_NAME @ $DOMAIN → 포트 $PORT)"
echo "   pm2 startup 이 출력한 명령어를 복사해서 실행하세요."
