"use client";

import Link from "next/link";

/**
 * Route-level error boundary for the whole `(dashboard)` group — `/dashboard`,
 * `/mau-thiep`, and `/editor/[id]` (Next 15 App Router convention: a client
 * component default-exporting `{ error, reset }`). Mirrors
 * `app/i/[slug]/error.tsx`'s Vietnamese-fallback approach.
 *
 * C4: `editor/[id]/page.tsx` deliberately `throw`s when an invitation's
 * `document` fails schema validation (see its own comment — falling back to
 * a blank document there would risk the next autosave permanently
 * overwriting the couple's real content), but until this fix, nothing in
 * `(dashboard)` caught that throw at all — a corrupt row showed a bare
 * framework error page in production, with no way back except the
 * browser's own Back button. "Về trang tổng quan" always links to
 * `/dashboard` rather than calling `reset()` — unlike a transient render
 * glitch, this class of error (schema-invalid document, or any other
 * uncaught throw here) isn't expected to go away by re-rendering the exact
 * same route, so the useful recovery is leaving it, not retrying it.
 */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-base text-gray-700">Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-gray-400 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Thử lại
        </button>
        <Link
          href="/dashboard"
          className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          Về trang tổng quan
        </Link>
      </div>
    </div>
  );
}
