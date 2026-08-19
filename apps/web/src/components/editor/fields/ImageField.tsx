"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const SIZE_ERROR = "Kích thước ảnh tối đa là 10MB.";
const TYPE_ERROR = "Định dạng ảnh phải là JPEG, PNG hoặc WebP.";
const UPLOAD_ERROR = "Không thể tải ảnh lên, vui lòng thử lại.";

/**
 * A 1x1 fully-transparent PNG, base64-encoded. `/api/uploads` now runs
 * `processImage` server-side and returns a real `blurDataUrl` for every
 * upload (see `onUploaded` below), so this constant is no longer a
 * stand-in for that — it survives only as the seed value for a placeholder
 * row that has no photo yet (`AlbumPanel`'s `createPlaceholderImage`),
 * where there's no real image to derive a blur preview from at all.
 */
export const TRANSPARENT_PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export interface ImageUploadedMeta {
  url: string;
  width: number;
  height: number;
  blurDataUrl: string;
}

export interface ImageFieldProps {
  label: string;
  /** Current image URL, "" if none. */
  value: string;
  onChange: (url: string) => void;
  /**
   * Fired with the server-measured dimensions and blur placeholder
   * alongside the uploaded URL — `/api/uploads` always measures these, so
   * this prop only controls whether the callback fires, not whether the
   * work happens. `AlbumPanel` needs it for `AlbumImageSchema`'s
   * `width`/`height`/`blurDataUrl`; the common single-image case, e.g.
   * `CoverPanel`'s cover photo, doesn't and simply omits it.
   */
  onUploaded?: (meta: ImageUploadedMeta) => void;
}

type Status = "idle" | "uploading" | "error";

/**
 * File picker + server-side upload: POSTs the raw file to `/api/uploads` as
 * `multipart/form-data`; the server runs the whole `processImage` pipeline
 * (resize, WebP variants, blur placeholder) and measures the real
 * dimensions, so the client no longer decodes the image itself just to
 * read its size (that used to happen here via a throwaway `<img>`; see git
 * history for `readImageDimensions` if a future task needs that pattern
 * again). Renders a thumbnail of the current value (if any) with a remove
 * button, and a Vietnamese status message while uploading/on failure.
 */
export function ImageField({ label, value, onChange, onUploaded }: ImageFieldProps) {
  const inputId = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the exact same file again still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      setError(TYPE_ERROR);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(SIZE_ERROR);
      return;
    }

    setStatus("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`POST /api/uploads failed with status ${res.status}`);
      const meta = (await res.json()) as { url: string; width: number; height: number; blurDataUrl: string };

      setStatus("idle");
      onChange(meta.url);
      onUploaded?.(meta);
    } catch (err) {
      console.error("ImageField: upload failed", err);
      setStatus("error");
      setError(UPLOAD_ERROR);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-500">
        {label}
      </label>

      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded remote URLs, not a build-time-known asset next/image can optimize */}
          <img src={value} alt={label} className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
          <button
            type="button"
            aria-label="Xoá ảnh"
            onClick={() => onChange("")}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Xoá ảnh
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        onChange={handleFileChange}
        // Disabled mid-upload so picking a second file before the first
        // finishes can't race two concurrent uploads against the same
        // `onChange`/`onUploaded` — whichever settled last would silently
        // win, discarding the other one's result.
        disabled={status === "uploading"}
        className="text-sm text-gray-600 file:mr-3 file:rounded-full file:border file:border-gray-300 file:bg-white file:px-3 file:py-1 file:text-xs file:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {status === "uploading" ? <span className="text-xs text-gray-400">Đang tải lên…</span> : null}
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
