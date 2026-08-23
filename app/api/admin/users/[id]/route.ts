import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, ["OWNER"]);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  if (id === actor.id) return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다" }, { status: 400 });

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
