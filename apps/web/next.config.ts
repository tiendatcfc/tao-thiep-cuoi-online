import type { NextConfig } from "next";

// `/_next/image?url=` makes Next's image optimizer fetch whatever URL it's
// given server-side — an unrestricted `remotePatterns` entry (e.g. a bare
// `https` + `**` hostname wildcard) turns that into an open SSRF proxy for
// any https URL on the internet. Only the two real hosts album images can
// ever point at are allowlisted: local MinIO, and whatever R2_PUBLIC_URL
// actually is in this environment (derived at config load so prod doesn't
// need a code change to swap buckets/domains).
const r2PublicUrl = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL) : null;

const nextConfig: NextConfig = {
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db"],
  images: {
    remotePatterns: [
      // Local dev MinIO container (see apps/web/src/lib/storage.ts).
      { protocol: "http", hostname: "localhost", port: "9000" },
      ...(r2PublicUrl
        ? [
            {
              protocol: r2PublicUrl.protocol.replace(":", "") as "http" | "https",
              hostname: r2PublicUrl.hostname,
              ...(r2PublicUrl.port ? { port: r2PublicUrl.port } : {}),
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
