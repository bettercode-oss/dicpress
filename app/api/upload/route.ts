import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { requireDocumentAccess } from "@/lib/document-access";

export async function POST(req: NextRequest) {
  const actor = await requireSession();
  if (actor instanceof NextResponse) return actor;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentId = formData.get("documentId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // 첨부 대상 문서가 지정됐다면 그 문서에 대한 권한도 확인한다
  if (documentId) {
    const allowed = await requireDocumentAccess(actor, documentId);
    if (allowed instanceof NextResponse) return allowed;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const ext = path.extname(file.name);
  const baseName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, baseName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const url = `/uploads/${baseName}`;

  const asset = await prisma.mediaAsset.create({
    data: {
      url,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      ...(documentId && { documentId }),
    },
  });

  return NextResponse.json({ url: asset.url }, { status: 201 });
}
