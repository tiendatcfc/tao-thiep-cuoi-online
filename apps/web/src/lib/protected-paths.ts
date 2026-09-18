/**
 * Which paths require a signed-in user, and where to send someone who isn't.
 *
 * Extracted into its own module because TWO places have to agree on it:
 * `auth.config.ts`'s `authorized` callback and `middleware.ts`. They cannot
 * be collapsed into one — see the long comment in `middleware.ts` about
 * `handleAuth`'s `else if` chain, which silently skips the `authorized`
 * result the moment a wrapper function is present. Two call sites, one
 * definition, so they cannot drift into disagreeing about what is private.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/editor"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Sign-in URL for a request that needs authentication, carrying where the
 * visitor was trying to go.
 *
 * The parameter is `next`, not Auth.js's own `callbackUrl`: `/dang-nhap`
 * reads `?next=` (through `sanitizeNextPath`) and has never read
 * `callbackUrl`, so Auth.js's built-in redirect was handing the sign-in
 * page a parameter it ignores — everyone who hit a protected link while
 * signed out landed on `/dashboard` afterwards instead of the page they
 * clicked. A relative path (not `url.href`) also keeps the value inside
 * what `sanitizeNextPath` will accept.
 */
export function signInUrlFor(url: URL): URL {
  const signInUrl = new URL("/dang-nhap", url);
  signInUrl.searchParams.set("next", `${url.pathname}${url.search}`);
  return signInUrl;
}
