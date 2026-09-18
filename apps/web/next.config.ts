import type { NextConfig } from "next";
import { getAllowedImageHosts } from "./src/lib/image-hosts";
import { warnAboutEnvFileConflict } from "./src/lib/env-files";

// `/_next/image?url=` makes Next's image optimizer fetch whatever URL it's
// given server-side — an unrestricted `remotePatterns` entry (e.g. a bare
// `https` + `**` hostname wildcard) turns that into an open SSRF proxy for
// any https URL on the internet. Only the two real hosts album images can
// ever point at are allowlisted: local MinIO, and whatever R2_PUBLIC_URL
// actually is in this environment. `getAllowedImageHosts` is shared with
// `app/i/[slug]/opengraph-image.tsx`'s own server-side cover-image fetch, so
// the two enforcement points can never drift apart.
// Runs once per `next dev`/`next build`, not per request. Next reads both
// `.env` and `.env.local` from this directory and lets `.env.local` win, so
// two copies means edits to one of them disappear with no error at all —
// which is exactly what happened here after the Google OAuth credentials
// were added. Key names only; never values.
warnAboutEnvFileConflict(__dirname);

const nextConfig: NextConfig = {
  // Traces the exact files the server needs into `.next/standalone`, so the
  // production image does not have to carry the node_modules of a whole
  // pnpm workspace. Required by apps/web/Dockerfile.
  output: "standalone",
  // Escape hatch for verifying a production build while a dev server is
  // running: both write to `.next`, and `next build` over a live
  // `next dev` leaves the dev server serving half-overwritten chunks until
  // it is restarted. Unset everywhere except a developer's own shell.
  ...(process.env.HPWD_DIST_DIR ? { distDir: process.env.HPWD_DIST_DIR } : {}),
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db", "@hpwd/worker"],
  images: {
    remotePatterns: getAllowedImageHosts(),
    /*
     * An invitation is a 430px column, and every `sizes` in this app is
     * bounded by it (the widest is `100vw` up to 430px). So the largest a
     * browser ever needs is 430 x 3 = 1290 device pixels.
     *
     * Next's default ladder jumps 1200 -> 1920, which meant a 3x phone —
     * most phones — asked for 1920 to fill a 1290px box. `processImage`
     * caps stored uploads at 1600px wide, and the optimizer never upscales,
     * so 1920, 2048 and 3840 were three names for "send the whole 1600px
     * photo": 593,014 bytes of the measurement image where 1200 was
     * 152,036. 1440 gives that case a rung to land on instead.
     *
     * 2048 and 3840 are dropped because they cannot differ from 1920 while
     * the source is capped at 1600 — they only lengthened every `srcset`
     * (and the LCP preload link, which carries the whole list).
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920],
    /*
     * Uploaded photos are immutable: `/api/uploads` writes a new object
     * under a fresh unguessable key for every upload, editing a photo
     * replaces the URL in the document rather than the bytes behind it, and
     * background removal produces a NEW asset. So a cached variant can
     * never go stale, and Next's 60-second default was throwing away work
     * it would have to redo for the next guest.
     *
     * It is worth real time. Measured against this deployment, resizing a
     * 1600x1600 source: 248ms cold, 2.8ms warm — 90x. On a wedding day 300
     * guests open the same invitation within minutes, so the difference is
     * one slow first load instead of everyone paying for a re-encode.
     */
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
};

export default nextConfig;
