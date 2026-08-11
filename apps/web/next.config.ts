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
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db"],
  images: {
    remotePatterns: getAllowedImageHosts(),
  },
};

export default nextConfig;
