"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const SIZE_ERROR = "Kích thước ảnh tối đa là 10MB.";
const TYPE_ERROR = "Định dạng ảnh phải là JPEG, PNG hoặc WebP.";
const UPLOAD_ERROR = "Không thể tải ảnh lên, vui lòng thử lại.";

/**
 * A 1x1 fully-transparent PNG, base64-encoded. Used as `AlbumImageSchema`'s
 * `blurDataUrl` when there's no cheap way to produce a real one client-side
 * — `processImage` (the real blur-hash pipeline) needs `sharp`, which is
 * server-only, and this field has no server round-trip to spend on it for
 * every image drop. HUMAN TODO / Phase 2: generate a real blur preview,
 * e.g. by having `/api/uploads` (or a follow-up endpoint) run `processImage`
 * server-side and return `blurDataUrl` alongside `publicUrl`.
 */
export const TRANSPARENT_PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export interface ImageUploadedMeta {
  url: string;
  width: number;
  height: number;
}

export interface ImageFieldProps {
  label: string;
  /** Current image URL, "" if none. */
  value: string;
  onChange: (url: string) => void;
  /**
   * Fired with the natural pixel dimensions alongside the uploaded URL —
   * only computed when this is provided (`AlbumPanel` needs it for
   * `AlbumImageSchema.width`/`height`; the common single-image case, e.g.
   * `CoverPanel`'s cover photo, doesn't).
   */
  onUploaded?: (meta: ImageUploadedMeta) => void;
}

type Status = "idle" | "uploading" | "error";

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không đọc được kích thước ảnh."));
    };
    img.src = objectUrl;
  });
}

/**
 * File picker + direct-to-storage upload: POSTs `/api/uploads` for a signed
 * URL, then PUTs the file to it with the *exact* `Content-Type` and byte
 * length declared in that POST — the presigner signs both, so a mismatch
 * here is a hard rejection, not just a lint nitpick (see
 * `src/lib/storage.ts`). Renders a thumbnail of the current value (if any)
 * with a remove button, and a Vietnamese status message while
 * uploading/on failure.
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
      const dimensions = onUploaded ? await readImageDimensions(file) : null;

      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "image", contentType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) throw new Error(`POST /api/uploads failed with status ${res.status}`);
      const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`PUT to signed URL failed with status ${putRes.status}`);

      setStatus("idle");
      onChange(publicUrl);
      if (onUploaded && dimensions) onUploaded({ url: publicUrl, ...dimensions });
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
