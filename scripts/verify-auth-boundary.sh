#!/usr/bin/env bash
#
# 관리자 API 의 보안 경계가 살아 있는지 확인한다.
#
# ── 무엇을 검사하나 ────────────────────────────────────────────────────────
# dicpress 의 서비스 토큰 경로는 nginx 가 클라이언트발 Authorization 헤더를 비운다는
# 전제 위에 서 있다(`proxy_set_header Authorization "";`).
#
#     location / {
#         proxy_set_header Authorization "";
#     }
#
# 이 한 줄이 실질적인 보안 경계인데, **저장소 밖(서버의 nginx 설정)에 있어서 조용히
# 사라져도 아무도 모른다.** CI 는 nginx 를 배포하지 않는다. 이 스크립트가 그 감시자다.
#
# ── 판정이 거꾸로다 ────────────────────────────────────────────────────────
# 유효한 토큰을 공개 URL 로 보내서 **401 이 나오면 정상**이다. 헤더가 nginx 에서 지워져
# 서버에 도달하지 못했다는 뜻이기 때문이다.
#
# 반대로 401 이 아닌 응답은 전부 **헤더가 살아서 통과했다**는 뜻이다.
#   200 → 토큰도 맞고 사용자도 찾았다. 완전 노출
#   403 → 토큰은 맞았고 사용자만 못 찾았다. 토큰 검증까지 갔다는 뜻이므로 역시 노출
#   400 → 토큰은 맞았고 X-Actor-Email 만 문제였다. 마찬가지
#
# ── 이 검사가 증명하지 못하는 것 ───────────────────────────────────────────
# ADMIN_SERVICE_TOKEN 이 서버의 실제 값과 다르면, 헤더가 통과하더라도 토큰 불일치로
# 401 이 나와 **거짓 정상**이 된다. 그래서 값의 존재와 최소 길이를 먼저 확인하지만,
# "서버와 같은 값인가" 까지는 밖에서 알 수 없다. 토큰을 회전할 때는 서버 .env 와
# 리포지토리 시크릿을 반드시 함께 갱신할 것.
#
# ── 사용법 ─────────────────────────────────────────────────────────────────
#   ADMIN_SERVICE_TOKEN=... ./scripts/verify-auth-boundary.sh
#   TARGET_URL=https://dic.bizos.kr/api/documents ./scripts/verify-auth-boundary.sh
#
set -euo pipefail

TARGET_URL="${TARGET_URL:-https://dic.bizos.kr/api/documents}"
ACTOR_EMAIL="${ACTOR_EMAIL:-boundary-check@invalid.local}"
MIN_TOKEN_LENGTH=32

fail() { echo "❌ $*" >&2; exit 1; }

# ── 토큰 사전 확인 ────────────────────────────────────────────────────────
# 토큰이 비어 있으면 curl 이 "Bearer " 를 보내고 401 이 나와 조용히 통과해 버린다.
# 그 거짓 정상이 이 스크립트의 존재 이유를 무너뜨리므로 여기서 끊는다.
TOKEN="${ADMIN_SERVICE_TOKEN:-}"
[ -n "$TOKEN" ] || fail "ADMIN_SERVICE_TOKEN 이 비어 있습니다. 이대로면 항상 401 이 나와 검사가 무의미합니다."
[ "${#TOKEN}" -ge "$MIN_TOKEN_LENGTH" ] || \
  fail "ADMIN_SERVICE_TOKEN 이 너무 짧습니다(${#TOKEN}자, 최소 ${MIN_TOKEN_LENGTH}자). 서버 값과 다를 가능성이 큽니다."

echo "▶ 경계 확인: $TARGET_URL"
echo "  유효한 토큰을 공개 URL 로 보냅니다. 401 이 나와야 정상입니다."

# 본문은 버린다. 경계가 깨진 경우 응답에 문서 내용이 실려 있어서, 로그로 남기면
# 유출 사고를 CI 로그에 그대로 복사하는 셈이 된다.
STATUS=$(
  curl -sS -o /dev/null -w '%{http_code}' \
    --max-time 15 --retry 2 --retry-connrefused \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-Actor-Email: ${ACTOR_EMAIL}" \
    "$TARGET_URL"
) || fail "요청 자체가 실패했습니다(네트워크·DNS·TLS). 경계 상태를 판단할 수 없습니다."

case "$STATUS" in
  401)
    echo "✅ 정상 (401). nginx 가 Authorization 헤더를 지우고 있습니다."
    exit 0
    ;;
  200|400|403)
    echo "" >&2
    echo "❌ 보안 경계가 깨졌습니다 — HTTP $STATUS" >&2
    echo "" >&2
    echo "  공개 URL 로 보낸 Authorization 헤더가 앱까지 도달했습니다." >&2
    echo "  ADMIN_SERVICE_TOKEN 을 아는 사람은 누구나 인터넷에서 X-Actor-Email 로" >&2
    echo "  임의의 사용자를 사칭할 수 있는 상태입니다." >&2
    echo "" >&2
    echo "  서버에서 확인하세요:" >&2
    echo "    nginx -T | grep -A2 -B2 'proxy_set_header Authorization'" >&2
    echo "" >&2
    echo "  없다면 /etc/nginx/sites-available/dic.bizos.kr 의 모든 location 블록에" >&2
    echo "  다음을 넣고 nginx -t && systemctl reload nginx 하세요:" >&2
    echo "    proxy_set_header Authorization \"\";" >&2
    echo "" >&2
    echo "  (응답 본문은 일부러 출력하지 않았습니다 — 문서 내용이 실려 있을 수 있습니다.)" >&2
    exit 1
    ;;
  *)
    fail "예상 밖의 응답 HTTP $STATUS. 경계 상태를 판단할 수 없어 실패로 처리합니다."
    ;;
esac
