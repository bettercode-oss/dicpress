import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, ["OWNER", "ADMIN"]);
  if (actor instanceof NextResponse) return actor;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });

  return NextResponse.json(users);
}
