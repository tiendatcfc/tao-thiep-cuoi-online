import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db"],
  images: {
    remotePatterns: [
      // Local dev MinIO container (see apps/web/src/lib/storage.ts).
      { protocol: "http", hostname: "localhost", port: "9000" },
      // TODO(deploy): pin this to the actual production R2/CDN hostname
      // before going live — wide open to any https host is a stand-in until
      // that domain exists.
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
