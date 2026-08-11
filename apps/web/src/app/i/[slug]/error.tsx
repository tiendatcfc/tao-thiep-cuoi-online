"use client";

/**
 * Route-level error boundary for `/i/[slug]` (Next 15 App Router
 * convention: a client component default-exporting `{ error, reset }`).
 * Wraps the whole public invitation render, so a throw in any one section
 * (a bad VietQR payload, a next/image config mismatch, anything) degrades
 * to this graceful fallback instead of a blank white page — the worst
 * possible outcome for a guest opening the link from a chat app.
 *
 * Deliberately doesn't reach for the invitation's theme colors
 * (`var(--primary)` etc.) — those are set by `InvitePage` itself, which is
 * exactly what may have failed to render, so this stays on plain neutral
 * Tailwind colors that don't depend on anything upstream having succeeded.
 */
export default function InvitationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-base text-gray-700">Đã có lỗi khi hiển thị thiệp.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full border border-gray-400 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        Thử lại
      </button>
    </div>
  );
}
