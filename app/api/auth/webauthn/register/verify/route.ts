import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { RP_ID, ORIGIN, consumeChallenge } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email, response }: { email: string; response: RegistrationResponseJSON } = await req.json();
  if (!email || !response) return NextResponse.json({ error: "email, response 필수" }, { status: 400 });

  const expectedChallenge = await consumeChallenge(email, "registration");
  if (!expectedChallenge) {
    return NextResponse.json({ error: "챌린지 없음 또는 만료됨" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "사용자 없음" }, { status: 404 });

  // macOS Passkey가 id를 표준 base64로 반환하는 경우 rawId(base64url)로 정규화
  const normalizedResponse: RegistrationResponseJSON = {
    ...response,
    id: response.rawId,
  };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: normalizedResponse,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "검증 실패" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "검증 실패" }, { status: 400 });
  }

  const { credentialID, credentialPublicKey, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await prisma.webAuthnCredential.create({
    data: {
      userId: user.id,
      credentialId: isoBase64URL.fromBuffer(credentialID),
      publicKey: Buffer.from(credentialPublicKey),
      counter: BigInt(verification.registrationInfo.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: response.response.transports?.join(",") ?? null,
    },
  });

  return NextResponse.json({ verified: true });
}
