import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "BetterCode 용어사전";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5분

export async function saveChallenge(email: string, challenge: string, type: string) {
  await prisma.webAuthnChallenge.upsert({
    where: { challenge },
    update: {},
    create: {
      challenge,
      email,
      type,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

export async function consumeChallenge(email: string, type: string) {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { email, type },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  // Postgres TIMESTAMP(without timezone) + Asia/Seoul 세션으로 인한 비교 오차 회피용 JS 레벨 체크
  if (record.expiresAt.getTime() < Date.now()) return null;
  await prisma.webAuthnChallenge.delete({ where: { id: record.id } });
  return record.challenge;
}

/** 인증 완료 후 클라이언트에 전달할 단발성 세션 토큰 생성 */
export async function createSessionToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: token,
      email,
      type: "session_token",
      expiresAt: new Date(Date.now() + 60_000), // 1분
    },
  });
  return token;
}

/** 세션 토큰을 소비해 해당 email 반환. 없거나 만료되면 null */
export async function consumeSessionToken(token: string): Promise<string | null> {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { challenge: token, type: "session_token" },
  });
  if (!record) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  await prisma.webAuthnChallenge.delete({ where: { id: record.id } });
  return record.email;
}
