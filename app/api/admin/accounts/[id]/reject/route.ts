import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, ["OWNER", "ADMIN"]);
  if (actor instanceof NextResponse) return actor;

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
