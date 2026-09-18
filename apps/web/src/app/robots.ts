import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * NOTE THE ONE THING THAT LOOKS MISSING: `/i/` is NOT disallowed here, even
 * though invitation pages must stay out of search results. That is on
 * purpose, and it is the classic trap. A crawler told not to fetch a URL
 * never sees the `noindex` on it, so Google keeps the URL in its index
 * (bare, with no snippet) and there is no way to get it out. Letting the
 * crawler in so it reads `robots: { index: false }` from
 * `app/i/[slug]/page.tsx` is what actually removes it.
 *
 * The paths below are different: they are either private (a 404 or a
 * redirect to sign-in for anyone crawling them) or machine endpoints, so
 * there is nothing for a crawler to read and no reason to spend the fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/editor/", "/dang-nhap"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
