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

echo "▶ .env.production 생성 (내용은 직접 편집하세요)..."
cp .env.production.example .env.production
echo "  → $DEPLOY_PATH/.env.production 을 편집하세요"

echo "▶ 의존성 설치..."
npm ci

echo "▶ 빌드..."
npm run build

echo "▶ 업로드 디렉토리 및 로그 디렉토리 생성..."
mkdir -p public/uploads logs

echo "▶ DB 마이그레이션 & 시드..."
npx prisma migrate deploy
npm run db:seed

echo "▶ Nginx 설정 생성..."
# envsubst 가 우리 변수만 치환하고 Nginx 내장 변수($host 등)는 건드리지 않도록
# 치환 대상을 명시적으로 지정합니다.
export APP_NAME DOMAIN DEPLOY_PATH PORT
envsubst '${APP_NAME} ${DOMAIN} ${DEPLOY_PATH} ${PORT}' \
    < "$SCRIPT_DIR/nginx.conf.template" \
    | sudo tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null
sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t && sudo systemctl reload nginx
echo "  → /etc/nginx/sites-available/$DOMAIN 생성 완료"

echo "▶ PM2로 앱 시작..."
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # 표시되는 명령어를 복사해서 실행하세요

echo "✅ 초기 세팅 완료 ($APP_NAME @ $DOMAIN → 포트 $PORT)"
