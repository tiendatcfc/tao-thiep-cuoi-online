"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FONT_ACCEPT_ATTRIBUTE, MAX_FONT_SIZE_BYTES, fontExtensionOf } from "@/lib/font";

export interface UploadedFont {
  assetId: string;
  family: string;
  url: string;
  /** Characters of the Vietnamese sample this font has no glyph for; `""` when it covers them all. */
  missingGlyphs: string;
}

const MESSAGES = {
  type: "Định dạng font phải là TTF, OTF hoặc WOFF2.",
  size: "Kích thước file font tối đa là 5MB.",
  generic: "Không tải được font lên, vui lòng thử lại.",
} as const;

/**
 * Picks a font file and POSTs it to `/api/uploads/font`.
 *
 * Unlike the music upload there is nothing to poll: parsing and WOFF2
 * conversion finish inside the request, so this goes straight from
 * "uploading" to done. The caller decides what to do with the result — this
 * field never touches the editor store itself.
 */
export function FontUploadField({ onUploaded }: { onUploaded: (font: UploadedFont) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear immediately so picking the SAME file again after a failure
    // still fires a change event.
    event.target.value = "";
    if (!file) return;

    setError(null);

    // Both checks are repeated server-side; they exist here only to spare
    // the couple a pointless multi-megabyte round trip.
    if (!fontExtensionOf(file.name)) {
      setError(MESSAGES.type);
      return;
    }
    if (file.size > MAX_FONT_SIZE_BYTES) {
      setError(MESSAGES.size);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/font", { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? MESSAGES.generic);
        return;
      }
      onUploaded(payload as UploadedFont);
    } catch {
      setError(MESSAGES.generic);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Kept out of the accessibility tree and the tab order entirely: the
          button below is the real control, and a focusable duplicate would
          make the panel appear to have two. Same pattern as MusicPanel. */}
      <input
        ref={inputRef}
        type="file"
        accept={FONT_ACCEPT_ATTRIBUTE}
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? "Đang tải font lên…" : "Tải font lên"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-500">
          {error}
        </span>
      ) : (
        <span className="text-xs text-gray-400">Hỗ trợ TTF, OTF, WOFF2. Tối đa 5MB.</span>
      )}
    </div>
  );
}
