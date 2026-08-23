import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";
import { requireDocumentAccess } from "@/lib/document-access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const allowed = await requireDocumentAccess(actor, id);
  if (allowed instanceof NextResponse) return allowed;

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
