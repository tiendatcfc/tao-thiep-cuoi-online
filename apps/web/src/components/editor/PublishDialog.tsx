"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InvitationDocument } from "@hpwd/schema";
import { findCoverSection } from "@/lib/sections";
import { toSlug } from "@/lib/slug";
import { useEditorStore } from "@/stores/editor-store";

const SLUG_REGEX = /^[a-z0-9-]{3,60}$/;
const SLUG_HINT =
  "Đường dẫn chỉ được chứa chữ thường không dấu, số và dấu gạch ngang, độ dài 3-60 ký tự.";
const GENERIC_PUBLISH_ERROR = "Xuất bản thất bại, vui lòng thử lại.";
const COPY_CONFIRMATION_MS = 2000;

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** `toSlug(groomName + '-' + brideName)`, falling back to `toSlug(slug || 'thiep-cuoi')` when that's empty. */
function computeDefaultSlug(document: InvitationDocument, currentSlug: string): string {
  const cover = findCoverSection(document.sections);
  const fromNames = cover ? toSlug(`${cover.props.groomName}-${cover.props.brideName}`) : "";
  if (fromNames) return fromNames;
  return toSlug(currentSlug || "thiep-cuoi") || "thiep-cuoi";
}

export interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  invitationId: string;
  /** The invitation's current slug (draft or already-published) — used both as the default-slug fallback and for the badge-toggle PATCH target. */
  slug: string;
  initialShowBadge: boolean;
}

/**
 * Header-triggered dialog for Task 17's publish flow. Two independent
 * network actions happen here, on purpose kept separate:
 *
 * - The badge toggle PATCHes `{settings}` immediately on change (optimistic,
 *   reverted on failure) — it's a "no-watermark" preference, not part of
 *   publishing itself, and the brief calls for it to persist via the
 *   existing autosave PATCH route rather than bundling it into the publish
 *   request.
 * - "Xuất bản" POSTs to `/api/invitations/[id]/publish`, which snapshots the
 *   *draft* `document` (read from the editor store, not sent in this
 *   request body — the server re-reads it) into `publishedDocument`.
 *
 * The slug input's default value is only (re)computed when the dialog
 * transitions to open — not on every store change — so a couple who's
 * already customized the slug field doesn't have it silently overwritten by
 * a name edit made elsewhere while the dialog happens to be open.
 */
export function PublishDialog({ open, onClose, invitationId, slug, initialShowBadge }: PublishDialogProps) {
  const document = useEditorStore((state) => state.document);
  const [slugInput, setSlugInput] = useState("");
  const [showBadge, setShowBadge] = useState(initialShowBadge);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Always-latest `onClose` without making it a dependency of the
  // open/close-keyed effect below — see that effect's own comment for why
  // this indirection exists at all.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    setSlugInput(computeDefaultSlug(document, slug));
    setShowBadge(initialShowBadge);
    setError(null);
    setPublishedSlug(null);
    setCopied(false);
    // Seed once per open transition — see the docstring above for why this
    // deliberately doesn't re-run on every `document`/`initialShowBadge`
    // change while already open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Basic focus trap + Escape-to-close. Declares `role="dialog"
  // aria-modal="true"` above, which is a promise to assistive tech that
  // focus stays inside while open — this is what actually keeps that
  // promise. Re-queries focusable elements on every Tab press (rather than
  // once) so it stays correct across the form <-> success-view swap inside
  // the same open dialog.
  //
  // Deliberately keyed on `[open]` alone, NOT `[open, onClose]`: the parent
  // (`EditorLayout`) passes `onClose={() => setPublishOpen(false)}` — a
  // fresh closure every render — so any unrelated re-render while the
  // dialog is open (autosave's `error` state flipping, `useMediaQuery`
  // crossing a breakpoint, ...) would otherwise re-run this effect and
  // yank focus back to the close button mid-typing. `onCloseRef` (above)
  // supplies the current callback to `handleKeyDown` without the effect
  // itself needing to depend on it.
  useEffect(() => {
    if (!open) return;

    const dialogEl = dialogRef.current;
    dialogEl?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogEl) return;

      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // `document` (the component's own state variable, shadowing the DOM
      // global of the same name) is why this reaches through `window.` —
      // `window.document` is always the real DOM document regardless of
      // what a same-named local variable is doing.
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.document.addEventListener("keydown", handleKeyDown);
    return () => window.document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  const isValidSlug = SLUG_REGEX.test(slugInput);
  const previewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/i/${slugInput || "…"}`;

  async function handleToggleBadge(next: boolean) {
    setShowBadge(next);
    try {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { showBadge: next } }),
      });
      if (!res.ok) throw new Error(`settings PATCH failed with status ${res.status}`);
    } catch {
      // Revert the optimistic flip rather than leaving the toggle showing a
      // state that never actually got saved.
      setShowBadge(!next);
    }
  }

  async function handlePublish(event: FormEvent) {
    event.preventDefault();
    if (!isValidSlug || publishing) return;

    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slugInput }),
      });
      const body = await res.json().catch(() => ({}) as { slug?: string; error?: string });
      if (!res.ok) {
        setError(typeof body.error === "string" && body.error ? body.error : GENERIC_PUBLISH_ERROR);
        return;
      }
      setPublishedSlug(typeof body.slug === "string" ? body.slug : slugInput);
    } catch {
      setError(GENERIC_PUBLISH_ERROR);
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopyLink() {
    if (!publishedSlug) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/i/${publishedSlug}`;
    // Same rationale as `GiftSection`'s copy button: in-app WebViews often
    // don't expose `navigator.clipboard` at all, and calling `.writeText`
    // unguarded throws synchronously in the click handler.
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    } catch {
      // Permission denied or otherwise unsupported — leave the button as-is
      // rather than lying about success.
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Xuất bản thiệp"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Xuất bản thiệp</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {publishedSlug ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-gray-700">Thiệp của bạn đã được xuất bản!</p>
            <p className="break-all rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800">
              {typeof window !== "undefined" ? window.location.origin : ""}/i/{publishedSlug}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 rounded-full border border-rose-500 px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                {copied ? "Đã sao chép!" : "Sao chép liên kết"}
              </button>
              <a
                href={`/i/${publishedSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-rose-700"
              >
                Xem thiệp
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePublish} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="publish-slug" className="text-sm font-medium text-gray-700">
                Đường dẫn thiệp
              </label>
              <input
                id="publish-slug"
                value={slugInput}
                onChange={(event) => setSlugInput(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {!isValidSlug ? <p className="text-xs text-red-600">{SLUG_HINT}</p> : null}
              <p className="truncate text-xs text-gray-500">{previewUrl}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showBadge}
                onChange={(event) => handleToggleBadge(event.target.checked)}
              />
              Hiện dòng chữ &quot;Tạo miễn phí tại HPWD&quot; ở cuối thiệp
            </label>

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!isValidSlug || publishing}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {publishing ? "Đang xuất bản…" : "Xuất bản"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
