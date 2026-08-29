import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, isEmailShape } from "@/lib/email-address";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // 저장 전에 정규화한다. 이 값이 그대로 AccountRequest → User.email 로 흘러가고,
  // 콘솔은 X-Actor-Email 을 소문자로 보내 **정확히 일치**로 조회한다 (#105).
  const email = normalizeEmail(body.email);
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });
  if (!isEmailShape(email)) {
    return NextResponse.json({ error: "이메일 형식이 아닙니다" }, { status: 400 });
  }

  const existing = await prisma.accountRequest.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === "PENDING") {
      return NextResponse.json({ error: "이미 신청된 이메일입니다" }, { status: 409 });
    }
    if (existing.status === "APPROVED") {
      return NextResponse.json({ error: "이미 승인된 이메일입니다" }, { status: 409 });
    }
    // REJECTED면 재신청 허용
    await prisma.accountRequest.update({
      where: { email },
      data: { name, status: "PENDING", requestedAt: new Date(), resolvedAt: null },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.accountRequest.create({ data: { email, name } });
  return NextResponse.json({ ok: true });
}
