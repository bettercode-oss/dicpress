import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { sendPasskeyRegistrationEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const request = await prisma.accountRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "신청 없음" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 신청입니다" }, { status: 409 });
  }

  // User 생성 (없으면)
  const user = await prisma.user.upsert({
    where: { email: request.email },
    update: {},
    create: {
      email: request.email,
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
      email: request.email,
      type: "registration_invite",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // 이메일 발송
  await sendPasskeyRegistrationEmail(request.email, user.name ?? "", token);

  // AccountRequest 승인 처리
  await prisma.accountRequest.update({
    where: { id },
    data: { status: "APPROVED", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
