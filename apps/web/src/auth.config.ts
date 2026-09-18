import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { isProtectedPath } from "@/lib/protected-paths";

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
    /**
     * NOTE: with `middleware.ts` passing a wrapper function to `auth()`,
     * next-auth's `handleAuth` never acts on this answer (its `else if`
     * chain prefers the wrapper), so the enforcement that matters happens
     * in the middleware itself. This stays because it is the contract any
     * other `auth()` call site gets, and both read the same
     * `isProtectedPath` so neither can drift.
     */
    authorized({ auth, request }) {
      if (isProtectedPath(request.nextUrl.pathname)) return !!auth?.user;
      return true;
    },
  },
} satisfies NextAuthConfig;
