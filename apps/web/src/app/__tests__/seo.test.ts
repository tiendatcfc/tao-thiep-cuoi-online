import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { siteUrl } from "@/lib/site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hpwd.vn");
    expect(siteUrl()).toBe("https://hpwd.vn");
  });

  // Doubling the slash would put `https://hpwd.vn//sitemap.xml` in robots.txt
  // and a different origin-plus-path in every sitemap entry than the
  // canonical tags use.
  it("drops a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hpwd.vn/");
    expect(siteUrl()).toBe("https://hpwd.vn");
  });
});

describe("robots", () => {
  it("keeps crawlers out of the private and machine-only paths", () => {
    const disallow = robots().rules;
    const rule = Array.isArray(disallow) ? disallow[0] : disallow;
    expect(rule?.disallow).toEqual(
      expect.arrayContaining(["/api/", "/dashboard/", "/editor/"]),
    );
  });

  // THE TRAP THIS PINS DOWN. Invitations must stay out of search results,
  // and the instinct is to disallow /i/ here. That would be self-defeating:
  // a crawler refused the page never reads the `noindex` on it, so the URL
  // stays in the index for good, bare and unremovable. Allowing the fetch
  // is what lets the noindex do its job.
  it("does NOT disallow /i/, because that would hide the noindex from crawlers", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow;
    const list = Array.isArray(disallow) ? disallow : disallow ? [disallow] : [];
    expect(list.some((path) => path.startsWith("/i"))).toBe(false);
  });

  it("points at the sitemap on the configured origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hpwd.vn");
    expect(robots().sitemap).toBe("https://hpwd.vn/sitemap.xml");
  });
});

describe("sitemap", () => {
  it("lists the public marketing pages, absolute", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hpwd.vn");
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://hpwd.vn/",
      "https://hpwd.vn/mau-thiep",
      "https://hpwd.vn/dieu-khoan",
      "https://hpwd.vn/bao-mat",
    ]);
  });

  it("lists no invitation", () => {
    expect(sitemap().some((entry) => entry.url.includes("/i/"))).toBe(false);
  });

  // `new Date()` here would tell every crawler on every fetch that all four
  // pages changed a moment ago.
  it("claims no modification date it does not know", () => {
    expect(sitemap().every((entry) => entry.lastModified === undefined)).toBe(true);
  });
});
