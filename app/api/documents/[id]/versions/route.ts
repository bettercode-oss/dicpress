import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { versionNo: "desc" },
    select: {
      id: true,
      versionNo: true,
      contentMd: true,
      createdAt: true,
    },
  });

  return NextResponse.json(versions);
}
