/**
 * Content-Security-Policy and the other response headers that harden every
 * page. Pure functions: `middleware.ts` owns the per-request nonce and the
 * decision of which requests get a policy, this file owns what the policy
 * says, so the rules are testable without a request at all.
 *
 * WHY THIS IS NOT `headers()` IN `next.config.ts`
 * Next freezes `headers()` into `routes-manifest.json` at BUILD time. The
 * policy has to name the object-storage origin (`R2_PUBLIC_URL`), so a
 * config-time policy would bake in whatever host the build machine had.
 * Deploying the same image against a different bucket or CDN domain would
 * then emit a policy that blocks the deployment's own photos, audio and
 * fonts — with no build warning and no server error, just an invitation
 * whose pictures are gone. Middleware reads `process.env` per request, so
 * the policy always describes the environment actually running.
 */

/**
 * Only the one variable this module reads, so a test can pass `{}` without
 * inventing a whole `ProcessEnv`. The index signature is what lets the real
 * `process.env` satisfy it.
 */
export interface StorageEnv {
  [key: string]: string | undefined;
  R2_PUBLIC_URL?: string;
}

/**
 * The browser-facing origin of the object store, e.g.
 * `https://cdn.hpwd.vn` from `https://cdn.hpwd.vn/hpwd`.
 *
 * Deliberately NOT `getAllowedImageHosts()` (`lib/image-hosts.ts`), even
 * though the two lists overlap. That one is a server-side fetch allowlist
 * and always carries `localhost:9000` as a dev convenience, which is
 * harmless when *our* server resolves it and quite different when a
 * *visitor's* browser does: `localhost` in a shipped policy means the
 * visitor's own machine, turning image loads into a probe of whatever they
 * happen to be running. Here the origin is derived from the environment
 * only, so local dev allows MinIO because `R2_PUBLIC_URL` genuinely points
 * at it, and production allows exactly the CDN and nothing else.
 */
export function storageOriginFromEnv(env: StorageEnv = process.env): string | null {
  if (!env.R2_PUBLIC_URL) return null;
  try {
    const url = new URL(env.R2_PUBLIC_URL);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    // One malformed env var must not 500 every request in the app,
    // including the health check someone would use to diagnose it.
    return null;
  }
}

export interface BuildCspOptions {
  /** Per-request random value; the only thing that lets our own inline scripts run. */
  nonce: string;
  /** Result of `storageOriginFromEnv`. */
  storageOrigin: string | null;
  /** Whether this request arrived over https. */
  https: boolean;
  /** `pnpm dev`. Loosens exactly two directives, never in production. */
  development: boolean;
}

export function buildCsp({ nonce, storageOrigin, https, development }: BuildCspOptions): string {
  const storage = storageOrigin ? [storageOrigin] : [];

  const directives: string[][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      // With `strict-dynamic` a browser that understands it ignores the
      // host allowlist and trusts only what our nonced scripts load — which
      // is what Next's chunk loader does. Older browsers fall back to
      // `'self'`, which is still correct here because every script this app
      // serves is same-origin.
      "'strict-dynamic'",
      // Turbopack's HMR client evaluates the code it receives over the dev
      // socket. Omitting this would break `pnpm dev` the day CSP ships.
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // DELIBERATE HOLE. framer-motion writes `style=""` onto every node it
    // animates and a nonce cannot cover a style ATTRIBUTE; `style-src-attr`
    // would be the precise tool but is not carried everywhere we need to
    // work. Inline style is a far smaller weapon than inline script — it
    // cannot fetch, cannot execute — so this is the one directive traded
    // away, said out loud rather than left looking accidental.
    ["style-src", "'self'", "'unsafe-inline'"],
    // `data:` for the blur placeholders sharp generates, `blob:` for the
    // local preview of a photo the couple has picked but not yet uploaded.
    ["img-src", "'self'", "data:", "blob:", ...storage],
    ["media-src", "'self'", ...storage],
    // Uploaded fonts are served from the object store (`@font-face` in
    // `CustomFontStyle`); the built-in families are same-origin `/fonts/`.
    ["font-src", "'self'", ...storage],
    // `lite-youtube-embed` swaps in the real iframe only after the guest
    // taps play. Forget this and the facade still renders and the thumbnail
    // still loads — the video just never starts, which is the least visible
    // way a policy can break a page.
    ["frame-src", "https://www.youtube-nocookie.com", "https://www.youtube.com"],
    ["connect-src", "'self'", ...(development ? ["ws:"] : [])],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
  ];

  const policy = directives.map((parts) => parts.join(" "));
  if (https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/**
 * Headers that are not the CSP but belong to the same envelope.
 * `Strict-Transport-Security` is https-only on purpose: over http it is
 * ignored by browsers at best, and pinning a developer's machine to https
 * for two years at worst.
 */
export function securityHeaders({ https }: { https: boolean }): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The app asks for none of these. Denying them up front means an
    // embedded third party (the YouTube frame) cannot ask either.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(https ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}
