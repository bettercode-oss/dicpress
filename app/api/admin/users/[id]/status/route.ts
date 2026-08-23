import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, ["OWNER", "ADMIN"]);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const { status } = await req.json();

  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    return NextResponse.json({ error: "유효하지 않은 상태" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });
  if (target.role === "OWNER") return NextResponse.json({ error: "OWNER 계정은 정지할 수 없습니다" }, { status: 400 });
  if (target.id === actor.id) return NextResponse.json({ error: "자신의 계정은 정지할 수 없습니다" }, { status: 400 });

  await prisma.user.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
