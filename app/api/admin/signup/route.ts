import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, name } = await req.json();
  if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });

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
