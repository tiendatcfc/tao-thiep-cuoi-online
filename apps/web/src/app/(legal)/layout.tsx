import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for `/dieu-khoan` and `/bao-mat`: a narrow reading-width
 * container plus a link back to the landing page. `DraftNotice` is rendered
 * by each page itself (not here) so a page-level test can render just that
 * page's default export and still see the banner, without needing this
 * layout mounted too.
 *
 * No `@tailwindcss/typography` `prose` classes — that plugin isn't
 * installed in this app (`apps/web/package.json`), so each page hand-styles
 * its own headings/paragraphs instead of relying on a plugin that would
 * silently no-op.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 hover:underline">
          ← Về trang chủ
        </Link>
        <article className="mt-6">{children}</article>
      </div>
    </div>
  );
}
