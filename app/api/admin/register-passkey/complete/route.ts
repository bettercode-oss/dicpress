import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token 필수" }, { status: 400 });

  const record = await prisma.webAuthnChallenge.findFirst({
    where: { challenge: token, type: "registration_invite" },
  });
  if (!record) return NextResponse.json({ error: "유효하지 않은 링크" }, { status: 400 });
  if (record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "만료된 링크입니다" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: record.email },
    include: { credentials: true },
  });
  if (!user) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });
  if (user.credentials.length === 0) {
    return NextResponse.json({ error: "Passkey를 먼저 등록해 주세요" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { status: "ACTIVE" },
    }),
    prisma.webAuthnChallenge.delete({ where: { id: record.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
