"use client";

import { useEffect, useRef, useState } from "react";
import type { Music } from "@hpwd/schema";
import {
  AUDIO_ACCEPT_ATTRIBUTE,
  MAX_AUDIO_SIZE_BYTES,
  isAudioContentType,
} from "@/lib/audio";
import { useEditorStore } from "@/stores/editor-store";
import { ToggleField } from "../fields/ToggleField";
import { SelectField } from "../fields/SelectField";
import { TextField } from "../fields/TextField";

interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
  category: string;
}

type SourceOption = "none" | "library" | "upload" | "url";

const SOURCE_OPTIONS = [
  { value: "none", label: "Không có nhạc" },
  { value: "library", label: "Thư viện" },
  { value: "upload", label: "Tải lên" },
  { value: "url", label: "Đường dẫn" },
];

/** Polling cadence and ceiling for the transcode. A 4 minute song converts in about a second; two minutes is a generous allowance for a busy worker, after which something is wrong. */
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 120_000;

const MESSAGES = {
  size: "Kích thước file nhạc tối đa là 15MB.",
  type: "Định dạng nhạc phải là MP3 hoặc M4A.",
  failed: "Xử lý nhạc thất bại. Hãy thử lại với file khác.",
  timeout: "Xử lý nhạc lâu hơn dự kiến. Hãy mở lại thiệp sau ít phút để kiểm tra.",
  generic: "Không tải được nhạc lên, vui lòng thử lại.",
};

/**
 * `MusicSchema.source` has only `"library" | "upload" | null`, but the panel
 * offers FOUR choices — an uploaded file and a pasted URL both live under
 * `source: "upload"`. `assetId` is what tells them apart: it is set only by
 * the upload flow, so a track the couple uploaded reopens on "Tải lên"
 * instead of showing them a raw storage URL in a text box.
 */
function toSourceOption(music: Music): SourceOption {
  if (music.source === "library") return "library";
  if (music.source === "upload") return music.assetId ? "upload" : "url";
  return "none";
}

/**
 * Document-level "Nhạc nền" tab. Owns exactly one `<audio>` element for
 * previewing library tracks — starting a new preview always pauses
 * whatever was playing first, and unmount stops playback rather than
 * leaving it running in the background.
 */
export function MusicPanel() {
  const music = useEditorStore((state) => state.document.music);
  const updateMusic = useEditorStore((state) => state.updateMusic);

  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Held locally rather than derived on every render: picking "Tải lên"
  // before any file exists leaves `assetId` null, which `toSourceOption`
  // reads as a pasted URL — a derived value would bounce the couple straight
  // back to the URL field the moment they chose the upload option. The
  // document is still the source of truth when the panel mounts.
  const [sourceOption, setSourceOption] = useState<SourceOption>(() => toSourceOption(music));

  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing" | "ready">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards every post-await `setState`: the couple can switch tabs while a
  // 15MB upload or a two-minute poll is still in flight.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sourceOption !== "library" || tracks !== null) return;
    let cancelled = false;
    fetch("/api/music")
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/music failed with status ${res.status}`);
        return res.json() as Promise<{ tracks: LibraryTrack[] }>;
      })
      .then((data) => {
        if (!cancelled) setTracks(data.tracks);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceOption, tracks]);

  // Stop playback whenever the <audio> element itself is about to unmount
  // — either because the whole panel unmounts (switching away from the
  // "Nhạc nền" tab, or selecting a section) or because the source changes
  // away from "library" — otherwise a preview started here would keep
  // playing silently in the background. The element is captured into a
  // local at effect-setup time, not re-read from `audioRef.current` inside
  // the cleanup: React detaches refs (sets them back to `null`) before
  // running passive-effect cleanups on a real unmount, so reading the ref
  // *inside* the cleanup would already see `null` and silently no-op (same
  // reasoning as `MusicPlayer`'s own unmount-stop effect). Keying on
  // `sourceOption` (not `[]`) also covers the element mounting later, once
  // the couple switches to "library" after this component was already
  // mounted on "none"/"url".
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, [sourceOption]);

  function stopPreview() {
    audioRef.current?.pause();
    setPreviewTrackId(null);
  }

  function togglePreview(track: LibraryTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewTrackId === track.id) {
      stopPreview();
      return;
    }
    // Always pause whatever was playing before starting the next one — a
    // single shared <audio> element makes this automatic (setting a new
    // `src` implicitly stops the old playback), but pausing explicitly
    // first keeps behaviour identical even if that assumption ever changes.
    audio.pause();
    audio.src = track.url;
    audio.currentTime = 0;
    audio.play().catch(() => setPreviewTrackId(null));
    setPreviewTrackId(track.id);
  }

  /**
   * Asks the server for this asset's status until it stops being
   * "processing". Re-armed with `setTimeout` rather than `setInterval` so a
   * slow response can never have two polls in flight at once.
   */
  async function pollStatus(assetId: string, deadline: number) {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(`/api/media/${assetId}`);
      if (!mountedRef.current) return;
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { status: string; url: string | null };
      if (!mountedRef.current) return;

      if (body.status === "ready" && body.url) {
        // `trackId: null` so a previously chosen library track cannot linger
        // and have MusicPlayer resolve the wrong URL.
        updateMusic({ source: "upload", url: body.url, trackId: null, assetId });
        setUploadPhase("ready");
        setUploadError(null);
        return;
      }
      if (body.status === "failed") {
        setUploadPhase("idle");
        setUploadError(MESSAGES.failed);
        return;
      }
      if (Date.now() >= deadline) {
        setUploadPhase("idle");
        setUploadError(MESSAGES.timeout);
        return;
      }
      pollTimerRef.current = setTimeout(() => void pollStatus(assetId, deadline), POLL_INTERVAL_MS);
    } catch {
      if (!mountedRef.current) return;
      setUploadPhase("idle");
      setUploadError(MESSAGES.generic);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the SAME file again still fires a change event,
    // which it otherwise would not after a failed attempt.
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setUploadedName(file.name);

    // Checked here as well as on the server: a 15MB upload that the server
    // will reject anyway should not be sent over a phone connection first.
    if (!isAudioContentType(file.type)) {
      setUploadPhase("idle");
      setUploadError(MESSAGES.type);
      return;
    }
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      setUploadPhase("idle");
      setUploadError(MESSAGES.size);
      return;
    }

    setUploadPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/audio", { method: "POST", body: form });
      if (!mountedRef.current) return;
      const body = (await res.json().catch(() => ({}))) as { assetId?: string; error?: string };
      if (!mountedRef.current) return;

      if (!res.ok || !body.assetId) {
        setUploadPhase("idle");
        // The server's own Vietnamese message is more specific than anything
        // generic here ("file quá 15MB", "hệ thống đang bận").
        setUploadError(body.error ?? MESSAGES.generic);
        return;
      }

      setUploadPhase("processing");
      void pollStatus(body.assetId, Date.now() + MAX_POLL_MS);
    } catch {
      if (!mountedRef.current) return;
      setUploadPhase("idle");
      setUploadError(MESSAGES.generic);
    }
  }

  function handleSourceChange(next: string) {
    stopPreview();
    setSourceOption(next as SourceOption);
    setUploadError(null);
    setUploadPhase("idle");
    setUploadedName(null);
    if (next === "none") {
      updateMusic({ source: null, url: null, trackId: null, assetId: null });
    } else if (next === "library") {
      // Clear `url`, not just leave the previous value: `MusicPlayer`
      // resolves a "library" source's playable URL as `music.url ??
      // <fetched-by-trackId>` — a stale `url` left over from a previous
      // "upload"/pasted-URL source would otherwise make it play that old
      // URL instead of the (not yet chosen) library track.
      updateMusic({ source: "library", url: null, assetId: null });
    } else {
      // Both remaining options ("Tải lên" and "Đường dẫn") are stored as
      // `source: "upload"`. Symmetric with the "library" branch above: clear
      // a stale `url` left over from a previously-*chosen* library track too,
      // so neither the URL box nor the upload slot starts out pre-filled with
      // someone else's track. `assetId` is cleared here and set again only
      // when an upload actually finishes.
      updateMusic({ source: "upload", trackId: null, url: null, assetId: null });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Nguồn nhạc" value={sourceOption} onChange={handleSourceChange} options={SOURCE_OPTIONS} />

      {sourceOption === "url" ? (
        <TextField
          label="Đường dẫn tệp nhạc"
          value={music.url ?? ""}
          onChange={(v) => updateMusic({ url: v })}
          placeholder="https://…/song.mp3"
        />
      ) : null}

      {sourceOption === "upload" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-500">File nhạc</span>
          {/* Hidden the same way GuestImportDialog hides its picker: the
              native control cannot be styled to match the panel, and leaving
              it focusable as well as the visible button would put two tab
              stops on one action. `aria-hidden` + `tabIndex={-1}` keep it out
              of the accessibility tree and the tab order entirely. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={AUDIO_ACCEPT_ATTRIBUTE}
            onChange={handleFileChange}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhase === "uploading" || uploadPhase === "processing"}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Chọn file nhạc
          </button>
          <p className="text-xs text-gray-400">
            Hỗ trợ MP3 hoặc M4A, tối đa 15MB. File sẽ được chuyển đổi tự động nên có thể mất vài giây.
          </p>

          {uploadPhase === "uploading" ? (
            <p className="text-xs text-gray-500">Đang tải lên{uploadedName ? ` “${uploadedName}”` : ""}…</p>
          ) : null}
          {uploadPhase === "processing" ? (
            <p className="text-xs text-gray-500">Đang xử lý nhạc… Bạn có thể tiếp tục chỉnh sửa trong lúc chờ.</p>
          ) : null}
          {uploadPhase === "ready" ? (
            <p className="text-xs text-emerald-600">Đã xử lý xong, nhạc đã được lưu vào thiệp.</p>
          ) : null}
          {/* Shown whenever there is a finished track — including immediately
              after an upload completes, which is exactly when the couple wants
              to hear it. Hidden only while a new file is in flight, when
              `music.url` still points at the previous track. */}
          {music.assetId && music.url && uploadPhase !== "uploading" && uploadPhase !== "processing" ? (
            <audio controls src={music.url} className="w-full" aria-label="Nghe thử nhạc đã tải lên" />
          ) : null}

          {uploadError ? (
            <p role="alert" className="text-xs text-red-500">
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}

      {sourceOption === "library" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-500">Chọn bài hát</span>
          {loadError ? (
            <p className="text-xs text-red-500">Không thể tải danh sách nhạc, vui lòng thử lại.</p>
          ) : tracks === null ? (
            <p className="text-xs text-gray-400">Đang tải danh sách nhạc…</p>
          ) : tracks.length === 0 ? (
            <p className="text-xs text-gray-400">Chưa có bài hát nào trong thư viện.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tracks.map((track) => (
                <li
                  key={track.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800">{track.title}</p>
                    <p className="truncate text-xs text-gray-400">{track.artist}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={previewTrackId === track.id ? `Tạm dừng ${track.title}` : `Nghe thử ${track.title}`}
                      onClick={() => togglePreview(track)}
                      className="rounded-full border border-gray-300 px-2 py-1 text-xs"
                    >
                      {previewTrackId === track.id ? "⏸" : "▶"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={music.trackId === track.id}
                      onClick={() => updateMusic({ source: "library", trackId: track.id, url: track.url })}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        music.trackId === track.id
                          ? "border-rose-400 bg-rose-50 text-rose-600"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {music.trackId === track.id ? "Đã chọn" : "Chọn"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <audio ref={audioRef} onEnded={() => setPreviewTrackId(null)} />
        </div>
      ) : null}

      <ToggleField
        label="Tự động phát sau khi mở thiệp"
        hint="Trình duyệt chỉ cho phép tự phát nhạc sau khi khách chạm vào màn hình mở thiệp."
        value={music.playAfterOpen}
        onChange={(v) => updateMusic({ playAfterOpen: v })}
      />
    </div>
  );
}
