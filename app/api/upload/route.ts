import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";
import { SITE_URL } from "@/lib/site";
import { requireDocumentAccess } from "@/lib/document-access";

export async function POST(req: NextRequest) {
  const actor = await requireActor(req);
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

  // url 은 상대 경로를 유지한다. 이 값이 contentMd 에 그대로 박히는데, 절대 URL 로 바꾸면
  // 기존 본문 전량 백필이 필요하고 도메인이 바뀌면 또 깨진다. 파일 서빙 주체도 계속
  // dic.bizos.kr 의 nginx 다. 다른 오리진에서 부르는 쪽(admin.bizos.kr 콘솔)이
  // 바로 쓸 수 있도록 절대 URL 을 함께 준다.
  return NextResponse.json(
    { url: asset.url, absoluteUrl: `${SITE_URL}${asset.url}` },
    { status: 201 },
  );
}
