import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/prisma";
import { RP_ID, saveChallenge } from "@/lib/webauthn";
import { normalizeEmail } from "@/lib/email-address";

export async function POST(req: NextRequest) {
  // 로그인 폼에 대문자가 섞여 들어와도 같은 계정을 찾아야 한다 (#105).
  const email = normalizeEmail((await req.json()).email);
  if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email, status: "ACTIVE" },
    include: { credentials: true },
  });
  if (!user || user.credentials.length === 0) {
    return NextResponse.json({ error: "등록된 Passkey 없음" }, { status: 404 });
  }

  const allowCredentials = user.credentials.map((c) => ({
    id: isoBase64URL.toBuffer(c.credentialId),
    type: "public-key" as const,
    transports: (c.transports?.split(",") ?? []) as AuthenticatorTransport[],
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: "preferred",
  });

  await saveChallenge(email, options.challenge, "authentication");

  return NextResponse.json(options);
}
