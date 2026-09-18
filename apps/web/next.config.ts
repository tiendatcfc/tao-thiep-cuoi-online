import type { NextConfig } from "next";
import { getAllowedImageHosts } from "./src/lib/image-hosts";

// `/_next/image?url=` makes Next's image optimizer fetch whatever URL it's
// given server-side — an unrestricted `remotePatterns` entry (e.g. a bare
// `https` + `**` hostname wildcard) turns that into an open SSRF proxy for
// any https URL on the internet. Only the two real hosts album images can
// ever point at are allowlisted: local MinIO, and whatever R2_PUBLIC_URL
// actually is in this environment. `getAllowedImageHosts` is shared with
// `app/i/[slug]/opengraph-image.tsx`'s own server-side cover-image fetch, so
// the two enforcement points can never drift apart.
const nextConfig: NextConfig = {
  // Escape hatch for verifying a production build while a dev server is
  // running: both write to `.next`, and `next build` over a live
  // `next dev` leaves the dev server serving half-overwritten chunks until
  // it is restarted. Unset everywhere except a developer's own shell.
  ...(process.env.HPWD_DIST_DIR ? { distDir: process.env.HPWD_DIST_DIR } : {}),
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db", "@hpwd/worker"],
  images: {
    remotePatterns: getAllowedImageHosts(),
  },
};

export default nextConfig;
