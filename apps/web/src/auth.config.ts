import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config: providers + route protection only.
 * No Prisma adapter here — this file is imported by `middleware.ts`,
 * which runs on the Edge runtime and cannot use the Node-only Prisma
 * client. `src/auth.ts` extends this config with the adapter and
 * database-dependent callbacks for use in Server Components/Route Handlers.
 */
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/dang-nhap",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/dashboard") || pathname.startsWith("/editor");

      if (isProtected) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
