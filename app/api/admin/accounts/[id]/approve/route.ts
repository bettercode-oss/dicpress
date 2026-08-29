import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";
import { sendPasskeyRegistrationEmail } from "@/lib/email";
import { maskEmail } from "@/lib/mask";
import { normalizeEmail } from "@/lib/email-address";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, ["OWNER", "ADMIN"]);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const request = await prisma.accountRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "신청 없음" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 신청입니다" }, { status: 409 });
  }

  // 신청 행이 정규화 이전(#105)에 만들어졌을 수 있으므로 여기서 한 번 더 통과시킨다.
  // 이 값이 곧 로그인·콘솔 조회의 열쇠가 된다 — 여기서 섞이면 되돌릴 방법이 없다.
  const email = normalizeEmail(request.email);

  // User 생성 (없으면)
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: request.name,
      role: "AUTHOR",
      status: "PENDING",
    },
  });

  // 등록 초대 토큰 생성 (24시간)
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: token,
      email,
      type: "registration_invite",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // 이메일 발송 — 실패해도 승인 자체는 완료한다.
  // 여기서 예외가 나가면 아래 승인 처리가 실행되지 않아, User와 토큰은 만들어졌는데
  // AccountRequest만 PENDING으로 남는 어긋난 상태가 된다. 관리자가 다시 승인하면
  // 토큰이 계속 쌓인다.
  let emailSent = true;
  try {
    await sendPasskeyRegistrationEmail(request.email, user.name ?? "", token);
  } catch (e) {
    emailSent = false;
    console.error(
      `[approve] 승인은 완료했으나 이메일 발송 실패 (${maskEmail(request.email)}):`,
      e instanceof Error ? e.message : e,
    );
  }

  // AccountRequest 승인 처리
  await prisma.accountRequest.update({
    where: { id },
    data: { status: "APPROVED", resolvedAt: new Date() },
  });

  // emailSent를 실어 관리자 화면이 발송 실패를 알 수 있게 한다.
  return NextResponse.json({ ok: true, emailSent });
}
