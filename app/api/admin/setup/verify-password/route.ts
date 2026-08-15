import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email, password 필수" }, { status: 400 });
  }

  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (ownerExists) {
    return NextResponse.json({ error: "이미 초기 설정이 완료되었습니다" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  const setupToken = crypto.randomBytes(32).toString("hex");
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: setupToken,
      email,
      type: "setup_token",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10분
    },
  });

  return NextResponse.json({ setupToken });
}
