import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, ["OWNER", "ADMIN"]);
  if (actor instanceof NextResponse) return actor;

  const accounts = await prisma.accountRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });

  return NextResponse.json(accounts);
}
