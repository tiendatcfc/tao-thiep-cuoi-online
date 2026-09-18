/**
 * The public origin of this deployment, e.g. `https://hpwd.vn`.
 *
 * `NEXT_PUBLIC_*` is inlined at BUILD time, not read at run time, so a
 * self-hosted deploy has to set it in the build environment — see
 * `.env.example`. The localhost fallback keeps local dev working.
 *
 * Shared by `app/layout.tsx` (metadataBase), `app/robots.ts` and
 * `app/sitemap.ts`: three places that must agree on one origin, or the
 * sitemap advertises URLs on a host the canonical tags disown.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
