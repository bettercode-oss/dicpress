import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";
import { SITE_URL } from "@/lib/site";
import { requireDocumentAccess } from "@/lib/document-access";

/**
 * 업로드 파일을 저장할 디렉터리.
 *
 * ## `public/uploads` 에 쓰면 안 되는 이유 (#90)
 *
 * 예전에는 `path.join(process.cwd(), "public", "uploads")` 를 그때그때 계산했다.
 * 로컬에서는 맞지만 **운영에서는 두 가지가 동시에 어긋난다.**
 *
 * 1. `output: "standalone"` 이라 PM2 가 띄우는 `.next/standalone/server.js` 가
 *    **자기 디렉터리로 chdir 한다.** 그래서 `process.cwd()` 는 저장소 루트가 아니라
 *    `.next/standalone` 이고, 파일은 `.next/standalone/public/uploads/` 에 쌓였다.
 *    nginx 는 `${DEPLOY_PATH}/public/uploads/` 를 보므로 업로드는 201 인데 그 URL 은 404 였다.
 * 2. 그 자리는 **배포마다 사라진다.** `npm run build` 가 standalone 출력을 새로 쓰고
 *    `deploy.yml` 이 `cp -r public .next/standalone/public` 로 다시 만든다.
 *
 * 그래서 경로를 **빌드 산출물 밖**으로 뺐다. `UPLOAD_DIR` 은 절대 경로여야 하고
 * (상대 경로면 1번 함정으로 그대로 돌아간다), nginx 의 `alias` 와 **같은 값**이어야 한다 —
 * `deploy/nginx.conf.template` 이 같은 변수를 쓴다.
 *
 * 기본값은 로컬 개발용이다. 로컬에서는 `next dev` 의 cwd 가 저장소 루트고 Next 가
 * `public/` 을 직접 서빙하므로 설정 없이 그대로 동작한다.
 */
const UPLOAD_DIR = resolveUploadDir();

function resolveUploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (!configured) return path.join(process.cwd(), "public", "uploads");

  if (!path.isAbsolute(configured)) {
    // 던지지 않는다 — 업로드만 어긋날 뿐 사이트는 멀쩡히 떠야 한다. 대신 크게 남긴다.
    // 조용히 넘어가면 #90 과 똑같이 "201 인데 404" 로 돌아간다.
    console.warn(
      `[upload] UPLOAD_DIR 이 상대 경로입니다("${configured}"). ` +
        `standalone 서버는 자기 디렉터리로 chdir 하므로 실제 저장 위치가 ` +
        `${path.resolve(configured)} 가 되고 nginx 가 서빙하는 경로와 어긋날 수 있습니다(#90). ` +
        `절대 경로로 지정하세요.`,
    );
  }
  return configured;
}

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

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, baseName);
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
  //
  // **URL 은 저장 위치와 무관하다.** UPLOAD_DIR 을 어디로 옮기든 공개 경로는 `/uploads/…`
  // 그대로다 — nginx 의 alias 가 둘을 잇는다. 그래서 #90 을 고치는 데 본문 백필이 없었다.
  return NextResponse.json(
    { url: asset.url, absoluteUrl: `${SITE_URL}${asset.url}` },
    { status: 201 },
  );
}
