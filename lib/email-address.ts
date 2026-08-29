/**
 * 이메일 주소를 다루는 한 곳.
 *
 * ## 왜 이 파일이 있나 (#105)
 *
 * `lib/authz.ts` 는 `X-Actor-Email` 을 **소문자로 정규화한 뒤 정확히 일치**로 조회한다.
 * 대소문자 무시 조회(`mode: "insensitive"` + `findFirst`)를 쓰지 않는 이유는, 대소문자만
 * 다른 두 행이 있을 때 **어느 쪽이 잡힐지 비결정적**이고 그 자체가 권한 우회 벡터이기
 * 때문이다. 그 판단은 옳다.
 *
 * 문제는 **저장 쪽에 같은 규칙이 없었다**는 것이다. `Gray@example.com` 으로 신청·승인되면
 * 그 문자열이 그대로 `User.email` 이 되고, 콘솔은 소문자로 보내므로 조회가 영영 빗나가
 * **승인된 계정이 계속 403** 을 받는다. 화면에는 "권한 없음" 만 뜨고 원인 단서가 없다.
 *
 * dicpress 자체 로그인도 같다 — WebAuthn 라우트들이 입력받은 이메일로 그대로 조회하므로,
 * 로그인 폼에 대문자를 섞어 넣으면 "등록된 Passkey 없음"(404)이 난다.
 *
 * 그래서 **밖에서 들어오는 이메일은 예외 없이 여기를 통과시킨다.** 정규화의 정의가 한 곳에만
 * 있어야 읽기와 쓰기가 어긋나지 않는다.
 */

/** RFC 5321 의 주소 최대 길이. 헤더·본문으로 들어오는 값이라 상한을 둔다. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * 저장·조회에 쓸 표준형으로 바꾼다. **이것이 정규화의 유일한 정의다.**
 *
 * 도메인만 소문자로 바꾸는 방식(로컬파트는 대소문자를 구분한다는 RFC 해석)은 쓰지 않는다.
 * 실제로 로컬파트를 구분하는 메일 서버는 사실상 없고, 그렇게 하면 `Gray@x.com` 과
 * `gray@x.com` 이 서로 다른 계정이 되어 **같은 사람에게 두 계정이 생긴다.**
 */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * 최소한의 형태 검사. **검증이 아니라 오타·빈 값 거르기다.**
 *
 * 이메일을 정규식으로 완전히 검증하려는 시도는 하지 않는다. RFC 5322 를 만족하는 정규식은
 * 실용성이 없고, 실제로 배달 가능한지는 보내 봐야만 안다. 여기서는 "@ 를 낀 두 조각이고
 * 공백이 없다" 까지만 본다.
 */
export function isEmailShape(email: string): boolean {
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;
  const parts = email.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes(".") && !parts[1].startsWith(".");
}
