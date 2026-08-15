import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, setupToken } = await req.json();
  if (!email || !setupToken) {
    return NextResponse.json({ error: "email, setupToken 필수" }, { status: 400 });
  }

  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (ownerExists) {
    return NextResponse.json({ error: "이미 초기 설정이 완료되었습니다" }, { status: 403 });
  }

  const tokenRecord = await prisma.webAuthnChallenge.findFirst({
    where: { challenge: setupToken, email, type: "setup_token" },
  });
  if (!tokenRecord || tokenRecord.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "설정 토큰이 만료되었습니다" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { credentials: true },
  });
  if (!user) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });
  if (user.credentials.length === 0) {
    return NextResponse.json({ error: "Passkey를 먼저 등록해 주세요" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { role: "OWNER", status: "ACTIVE", password: null },
    }),
    prisma.webAuthnChallenge.delete({ where: { id: tokenRecord.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
