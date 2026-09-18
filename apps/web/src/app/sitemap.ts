import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * The four pages meant to be found in search. Published invitations are
 * deliberately absent: they carry guests' names, home addresses, phone
 * numbers and bank details, nobody asked for them to be searchable, and
 * every one of them serves `noindex` anyway — listing them here would be
 * this file arguing with the pages themselves.
 *
 * No `lastModified`: it is not known for these pages, and `new Date()`
 * would tell every crawler on every fetch that everything changed a moment
 * ago, which is worse than saying nothing.
 */
const PUBLIC_PATHS = ["/", "/mau-thiep", "/dieu-khoan", "/bao-mat"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PATHS.map((path) => ({ url: `${base}${path}` }));
}
