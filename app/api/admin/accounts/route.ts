import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const accounts = await prisma.accountRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });

  return NextResponse.json(accounts);
}
