import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/prisma";
import { RP_ID, saveChallenge } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
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
