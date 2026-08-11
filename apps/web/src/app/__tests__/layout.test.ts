import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B2: without `metadataBase`, Next has no way to turn a relative URL
 * (`app/i/[slug]/page.tsx`'s `openGraph.url = "/i/${slug}"`, and the
 * implicit `openGraph.images` entry every `opengraph-image.tsx` convention
 * file contributes) into an absolute one, and falls back to
 * `http://localhost:3000` on a non-Vercel deploy — silently breaking every
 * link preview in production. `metadata.metadataBase` is computed once at
 * module-eval time from `process.env.NEXT_PUBLIC_SITE_URL`, so each case
 * below resets the module registry and re-imports with a fresh env value.
 */
describe("app/layout.tsx metadataBase (B2)", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it("defaults to http://localhost:3000 for local dev when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { metadata } = await import("../layout");
    expect(metadata.metadataBase?.toString()).toBe("http://localhost:3000/");
  });

  it("uses NEXT_PUBLIC_SITE_URL as metadataBase when set — the real production fix", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://hpwd.vn";
    const { metadata } = await import("../layout");
    expect(metadata.metadataBase?.toString()).toBe("https://hpwd.vn/");
  });

  it("resolves a per-invitation relative openGraph.url against the env-configured metadataBase, not localhost", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://hpwd.vn";
    const { metadata } = await import("../layout");

    // Mirrors `app/i/[slug]/page.tsx`'s `generateMetadata`, which returns
    // `openGraph.url = "/i/${slug}"` — a relative path, by design, so it
    // combines with whatever `metadataBase` the layout provides. This is
    // exactly what Next's own resolver (`resolveUrl` /
    // `resolveAbsoluteUrlWithPathname`, `next/dist/lib/metadata/resolvers/
    // resolve-url.js`) does for a plain relative pathname: joins it onto
    // `metadataBase` with `new URL(pathname, metadataBase)`.
    const relativeOpenGraphUrl = "/i/minh-lan";
    const resolved = new URL(relativeOpenGraphUrl, metadata.metadataBase);

    expect(resolved.toString()).toBe("https://hpwd.vn/i/minh-lan");
    // The bug this pins: pre-fix, metadataBase was undefined and Next's own
    // fallback for that case is exactly this origin.
    expect(resolved.toString()).not.toContain("localhost:3000");
  });
});
