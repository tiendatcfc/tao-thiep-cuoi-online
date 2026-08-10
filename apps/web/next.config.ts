import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @hpwd/db ships raw TypeScript (no build step), so Next must transpile it.
  transpilePackages: ["@hpwd/db"],
};

export default nextConfig;
