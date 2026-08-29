import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { consumeSessionToken } from "@/lib/webauthn";
import { normalizeEmail } from "@/lib/email-address";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // 비밀번호 기반 (초기 Owner 설정 전용)
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          // 입력 이메일도 정규화한다. 저장이 소문자이므로 여기서 맞추지 않으면
          // 대문자를 섞어 넣은 사람이 "비밀번호가 틀렸다" 로 오해한다 (#105).
          where: { email: normalizeEmail(credentials.email) },
        });
        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(String(credentials.password), user.password);
        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role };
      },
    }),
    // WebAuthn 인증 완료 후 단발성 토큰으로 세션 발급
    Credentials({
      id: "webauthn",
      credentials: { token: {} },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const email = await consumeSessionToken(String(credentials.token));
        if (!email) return null;

        const user = await prisma.user.findUnique({
          where: { email, status: "ACTIVE" },
        });
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as "OWNER" | "ADMIN" | "AUTHOR";
      return session;
    },
  },
});
