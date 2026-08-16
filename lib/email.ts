import { Resend } from "resend";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "BetterCode 용어사전";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function sendPasskeyRegistrationEmail(to: string, name: string, token: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM ?? "noreply@bizos.kr";
  const link = `${SITE_URL}/admin/register-passkey?token=${token}`;

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `[${SITE_NAME}] Passkey 등록 링크`,
    html: `
      <p>안녕하세요 ${name || to}님,</p>
      <p>${SITE_NAME} 관리자 계정이 승인되었습니다.<br>
      아래 링크를 클릭해 Passkey를 등록하면 로그인하실 수 있습니다.</p>
      <p><a href="${link}" style="color:#2563eb">Passkey 등록하기</a></p>
      <p style="color:#6b7280;font-size:12px">이 링크는 24시간 후 만료됩니다.<br>
      본인이 신청하지 않은 경우 이 이메일을 무시하세요.</p>
    `,
  });
  if (error) {
    console.error("[Resend] 이메일 발송 실패:", JSON.stringify(error));
    throw new Error(`이메일 발송 실패: ${error.message}`);
  }
  console.log("[Resend] 이메일 발송 성공:", data?.id);
}
