import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Prisma, no bcrypt
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/admin/login";

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/admin/documents", nextUrl));
        return true;
      }

      if (nextUrl.pathname.startsWith("/admin")) return isLoggedIn;

      return true;
    },
  },
};
