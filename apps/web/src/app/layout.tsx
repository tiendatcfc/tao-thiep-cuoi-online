import type { Metadata } from "next";
import "./globals.css";

/**
 * B2 fix: without an explicit `metadataBase`, Next has no way to turn a
 * relative URL (`app/i/[slug]/page.tsx`'s `openGraph.url = "/i/${slug}"`,
 * and the implicit `openGraph.images` entry every `opengraph-image.tsx`
 * convention file contributes) into an absolute one — verified against Next
 * 15.5.23's own resolver (`resolveUrl`/`resolveAbsoluteUrlWithPathname`),
 * which falls back to `http://localhost:3000` on any non-Vercel deploy with
 * no `metadataBase` set. That means `og:image`/`og:url` point at localhost
 * in production, so Zalo/Facebook/iMessage render no link preview at all —
 * silently killing the entire sharing loop Task 17 built, with no
 * build-time warning because `/i/[slug]` is dynamic (per-request).
 *
 * `NEXT_PUBLIC_SITE_URL` MUST be set to the real production origin — see
 * `.env.example`. The `localhost:3000` fallback keeps local dev working
 * without it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  // Fallback for any route that doesn't set its own `metadata`/`generateMetadata`
  // (a plain string here, not a `title.template`, so per-route metadata like
  // `app/i/[slug]`'s per-invitation title fully replaces this rather than
  // having it appended).
  title: "HPWD — Thiệp cưới online miễn phí",
  description: "Tạo thiệp cưới online miễn phí, không watermark.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The whole app is Vietnamese-only (no i18n — see YAGNI note in the Task
  // 19 brief), so `lang="vi"` here, not the create-next-app default "en":
  // besides being simply correct, an `<html>` `lang` that mismatches the
  // page's actual language is an Accessibility/SEO audit finding.
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
