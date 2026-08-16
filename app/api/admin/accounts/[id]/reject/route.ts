import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { id } = await params;
  const request = await prisma.accountRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "신청 없음" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 신청입니다" }, { status: 409 });
  }

  await prisma.accountRequest.update({
    where: { id },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
