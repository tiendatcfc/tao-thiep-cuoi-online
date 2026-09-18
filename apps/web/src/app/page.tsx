import type { Metadata } from "next";
import { prisma } from "@hpwd/db";
import { siteUrl } from "@/lib/site-url";
import { LandingPage } from "./LandingPage";

// B3 fix: this page used to be statically prerendered at build time, which
// runs `prisma.template.findMany()` against whatever DATABASE_URL the build
// environment has — on a fresh database with no migrations applied yet
// (exactly what CI's Build step does today: it runs `prisma generate` but
// never `prisma migrate deploy`), that throws ("The table public.Template
// does not exist") and fails the whole `next build`. `force-dynamic` moves
// the query to request time instead (also fixing the secondary issue that
// a build-time-baked template strip would never reflect later-seeded
// templates), and `loadTemplates` below still degrades to the empty-state
// `LandingPage` already handles on ANY query failure — a DB blip must never
// break the homepage, and a migration lag right after a fresh deploy is
// exactly that kind of blip.
export const dynamic = "force-dynamic";

const TITLE = "HPWD — Tạo thiệp cưới online miễn phí, không watermark";
const DESCRIPTION =
  "Thiết kế thiệp cưới online theo từng mục: bìa, cô dâu chú rể, sự kiện, album ảnh, hộp mừng QR ngân hàng, sổ lời chúc, RSVP. Miễn phí, không watermark, xuất bản trong vài phút.";

/**
 * Static — nothing here depends on the request, unlike `app/i/[slug]`'s
 * per-invitation `generateMetadata`. Still exported as a function (rather
 * than a plain `metadata` object) to match that page's shape and stay
 * trivially unit-testable by calling it directly.
 */
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    // Resolved against `metadataBase` in the root layout. Without it the
    // same page is reachable at `/`, `/?utm_source=...` and any other query
    // a shared link picks up, and search engines rank the copies against
    // each other.
    alternates: { canonical: "/" },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: "/",
      type: "website",
      locale: "vi_VN",
    },
  };
}

/**
 * Schema.org description of the site, for the search result rather than the
 * page. Only `WebSite` — an `Organization` block would have to state a
 * name, a logo and a contact point, and this project has no registered
 * entity and no contact address yet (see the legal pages' own placeholder),
 * so filling one in would be inventing a company.
 *
 * `type="application/ld+json"` is data, not code: browsers do not execute
 * it, so the CSP's `script-src` does not apply and it needs no nonce.
 * Verified in Chrome against the enforced policy.
 */
function websiteJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "HPWD",
    url: siteUrl(),
    description: DESCRIPTION,
    inLanguage: "vi-VN",
  });
}

type LandingTemplateRow = { id: string; name: string; thumbnailUrl: string };

/**
 * Same query `HomePage` needs, isolated so a DB failure (missing table on
 * an unmigrated database, a connection blip, ...) degrades to an empty
 * list — exactly what `LandingPage` already renders its own "Chưa có mẫu
 * thiệp nào." empty state for — instead of taking down the whole homepage.
 * Never throws.
 */
async function loadTemplates(): Promise<LandingTemplateRow[]> {
  try {
    return await prisma.template.findMany({
      where: { isActive: true, tier: "basic" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, thumbnailUrl: true },
    });
  } catch (error) {
    console.error("HomePage: failed to load templates, showing the empty state instead:", error);
    return [];
  }
}

/**
 * The public marketing landing page, `/`. Fetches the same live Basic
 * templates `/mau-thiep` shows (Task 18) so the gallery strip here never
 * drifts out of sync with what a couple actually sees after clicking
 * through. `LandingPage` (the presentational half) renders its own "Chưa có
 * mẫu thiệp nào." empty state if this comes back empty.
 */
export default async function HomePage() {
  const templates = await loadTemplates();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd() }} />
      <LandingPage templates={templates} />
    </>
  );
}
