import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "OWNER만 삭제 가능" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id) return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });
  if (target.role === "OWNER") return NextResponse.json({ error: "OWNER 계정은 삭제할 수 없습니다" }, { status: 400 });

  await prisma.$transaction([
    prisma.webAuthnCredential.deleteMany({ where: { userId: id } }),
    prisma.accountRequest.deleteMany({ where: { email: target.email } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
