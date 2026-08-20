import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/prisma";
import { RP_ID, RP_NAME, saveChallenge, verifyRegistrationToken } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email, token } = await req.json();
  if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });

  if (!token || !(await verifyRegistrationToken(String(token), email))) {
    return NextResponse.json({ error: "유효하지 않은 등록 토큰" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { credentials: true },
  });
  if (!user) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });

  const excludeCredentials = user.credentials.map((c) => ({
    id: isoBase64URL.toBuffer(c.credentialId),
    type: "public-key" as const,
    transports: (c.transports?.split(",") ?? []) as AuthenticatorTransport[],
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveChallenge(email, options.challenge, "registration");

  return NextResponse.json(options);
}
