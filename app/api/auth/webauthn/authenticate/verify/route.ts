import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { RP_ID, ORIGIN, consumeChallenge, createSessionToken } from "@/lib/webauthn";
import { normalizeEmail } from "@/lib/email-address";

export async function POST(req: NextRequest) {
  const body: { email: string; response: AuthenticationResponseJSON } = await req.json();
  const response = body.response;
  // options 단계에서 정규화된 값으로 챌린지를 저장했으므로 여기서도 같게 맞춘다 (#105).
  const email = normalizeEmail(body.email);
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

  // macOS Passkey가 id를 표준 base64로 반환할 수 있으므로 rawId(base64url)로 정규화
  const normalizedResponse: AuthenticationResponseJSON = {
    ...response,
    id: response.rawId,
  };

  const credential = user.credentials.find((c) => c.credentialId === normalizedResponse.id);
  if (!credential) return NextResponse.json({ error: "Passkey 없음" }, { status: 404 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: normalizedResponse,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
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
