import type { Metadata } from "next";
import "./globals.css";

// Fallback for any route that doesn't set its own `metadata`/`generateMetadata`
// (a plain string here, not a `title.template`, so per-route metadata like
// `app/i/[slug]`'s per-invitation title fully replaces this rather than
// having it appended).
export const metadata: Metadata = {
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
