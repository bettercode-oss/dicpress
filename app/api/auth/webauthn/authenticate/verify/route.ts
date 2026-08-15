import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { RP_ID, ORIGIN, consumeChallenge, createSessionToken } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email, response }: { email: string; response: AuthenticationResponseJSON } = await req.json();
  if (!email || !response) return NextResponse.json({ error: "email, response 필수" }, { status: 400 });

  const expectedChallenge = await consumeChallenge(email, "authentication");
  if (!expectedChallenge) {
    return NextResponse.json({ error: "챌린지 없음 또는 만료됨" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email, status: "ACTIVE" },
    include: { credentials: true },
  });
  if (!user) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });

  const credential = user.credentials.find((c) => c.credentialId === response.id);
  if (!credential) return NextResponse.json({ error: "Passkey 없음" }, { status: 404 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(credential.credentialId),
        credentialPublicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: (credential.transports?.split(",") ?? []) as AuthenticatorTransport[],
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "검증 실패" }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "검증 실패" }, { status: 400 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });

  const token = await createSessionToken(email);
  return NextResponse.json({ verified: true, token });
}
