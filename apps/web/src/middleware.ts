import NextAuth from "next-auth";
import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { buildCsp, securityHeaders, storageOriginFromEnv } from "@/lib/csp";
import { isProtectedPath, signInUrlFor } from "@/lib/protected-paths";

const { auth } = NextAuth(authConfig);

/**
 * `CSP_REPORT_ONLY=true` switches to the report-only header, which browsers
 * log and do not enforce. Meant for the first deploy against real traffic:
 * a policy is only ever wrong in ways nobody predicted, and hearing about
 * it from a console report beats hearing about it from a couple whose
 * photos vanished on their wedding day.
 */
const CSP_HEADER =
  process.env.CSP_REPORT_ONLY === "true"
    ? "content-security-policy-report-only"
    : "content-security-policy";

/**
 * Per-request nonce. Base64 of 16 random bytes, which is the shape Next's
 * own parser expects (`/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/` in
 * `get-script-nonce-from-header`); anything it cannot parse is dropped
 * silently, and then every inline script on the page is blocked.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function isHttps(request: NextRequest): boolean {
  // Behind a TLS-terminating proxy the connection to us is plain http, so
  // the forwarded protocol is the only truth available. Defaulting to "not
  // https" only ever costs an omitted HSTS header — the safe way to be
  // wrong.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0]?.trim() === "https";
  return request.nextUrl.protocol === "https:";
}

function withSecurityHeaders(
  response: NextResponse,
  request: NextRequest,
  csp: string | null,
): NextResponse {
  for (const [name, value] of Object.entries(securityHeaders({ https: isHttps(request) }))) {
    response.headers.set(name, value);
  }
  if (csp) response.headers.set(CSP_HEADER, csp);
  return response;
}

/**
 * Continue to the route, carrying a Content-Security-Policy.
 *
 * The policy goes on the REQUEST headers as well as the response, and that
 * is not belt and braces: `app-render.js` reads
 * `headers['content-security-policy']` off the INCOMING request and takes
 * the nonce from there to stamp onto its own inline scripts. Set it only on
 * the response and Next never sees a nonce, emits unnonced inline scripts,
 * and the browser blocks the very bootstrap that hydrates the page — a
 * blank, unresponsive invitation with nothing in the server log.
 */
function secureNext(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    storageOrigin: storageOriginFromEnv(),
    https: isHttps(request),
    development: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER, csp);
  requestHeaders.set("x-nonce", nonce);

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    request,
    csp,
  );
}

/**
 * The signed-in half. Only `/dashboard` and `/editor` reach this.
 *
 * WHY THE REDIRECT IS WRITTEN OUT BY HAND
 * `next-auth`'s `handleAuth` decides what to do with the `authorized`
 * callback's answer in an `else if` chain: a custom `Response` wins, ELSE a
 * user middleware wrapper runs, ELSE an unauthorized request is redirected
 * to the sign-in page. Passing a wrapper — the only way to attach headers
 * to the response — therefore puts the redirect branch out of reach, and
 * `authorized` returning `false` quietly stops meaning anything. Wrapping
 * this file the obvious way would have unprotected `/dashboard` and
 * `/editor` for everyone, with no error, no failing type and no failing
 * test.
 */
// The two parameters are what picks `auth()`'s middleware overload; with a
// single parameter TypeScript resolves it to the route-handler overload
// instead, whose context argument a middleware never receives.
const authedMiddleware = auth((request: NextAuthRequest, _event: NextFetchEvent) => {
  if (!request.auth?.user) {
    return withSecurityHeaders(NextResponse.redirect(signInUrlFor(request.nextUrl)), request, null);
  }
  return secureNext(request);
});

/**
 * Only protected paths pay for a session lookup. Wrapping every request in
 * `auth()` would run a full Auth.js session decode for each guest opening
 * an invitation — work whose answer is never read, on exactly the page
 * that has to be fastest — and would raise Auth.js's `UntrustedHost` error
 * on every public URL when `AUTH_TRUST_HOST` is unset, drowning the log in
 * a message about a feature that page does not use.
 */
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isProtectedPath(request.nextUrl.pathname)) {
    return authedMiddleware(request, event);
  }
  return secureNext(request);
}

export const config = {
  /**
   * Everything except Next's own immutable build output and static files.
   *
   * It used to be just `/dashboard` and `/editor`, because only protected
   * routes needed the auth check. Headers are different: a policy covering
   * only the two pages already behind a login protects nobody, since the
   * pages that take untrusted input — a published invitation, its guest
   * names, its wishes — are precisely the public ones.
   *
   * `_next/static` and `_next/image` are excluded because they are served
   * from an immutable cache where a per-request nonce is meaningless. The
   * file-extension clause keeps `/fonts/*.woff2`, `favicon.ico` and friends
   * out for the same reason.
   */
  matcher: ["/((?!_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
