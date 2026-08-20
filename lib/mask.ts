/**
 * 로그·에러 메시지에 실리는 이메일 주소를 가린다.
 *
 * 로그 자체는 지우지 않는다. 발송 실패 로그는 원인 추적에 필요하다
 * (#46에서 발신 주소가 샌드박스로 설정돼 있던 것을 이 로그로 찾았다).
 * 로그 레벨을 낮추는 것도 효과가 없다 — PM2는 stdout/stderr를 모두 수집한다.
 */

// 로컬 파트의 첫 글자와 도메인만 남긴다.
const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** someone@example.com → s***@example.com */
export function maskEmail(email: string): string {
  return maskEmails(email);
}

/**
 * 문자열 안의 모든 이메일을 가린다.
 *
 * 우리가 만든 문자열뿐 아니라 **외부 응답 메시지에 박혀 오는 주소**도 가려야 해서
 * 통째로 훑는다. 예: Resend의 "You can only send ... (a@b.com). ..."
 *
 * 로컬 파트 길이와 무관하게 `***` 고정이라 길이도 노출되지 않는다.
 * 도메인은 남긴다 — 어느 도메인으로 실패했는지는 운영상 알아야 한다.
 */
export function maskEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, (_match, first: string, domain: string) => `${first}***${domain}`);
}
