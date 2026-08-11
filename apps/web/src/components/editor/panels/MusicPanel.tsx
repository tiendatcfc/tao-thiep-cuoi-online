"use client";

import { useEffect, useRef, useState } from "react";
import type { Music } from "@hpwd/schema";
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

type SourceOption = "none" | "library" | "url";

const SOURCE_OPTIONS = [
  { value: "none", label: "Không có nhạc" },
  { value: "library", label: "Thư viện" },
  { value: "url", label: "Đường dẫn" },
];

/**
 * `MusicSchema.source` only has `"library" | "upload" | null` — there is no
 * dedicated "just paste a URL" enum value. The brief's 3rd UI option
 * ("Đường dẫn") maps onto `source: "upload"`: the couple types/pastes an
 * already-hosted URL directly (no file picker, no PUT-to-storage flow —
 * that's the Phase 2 upload feature this task explicitly does not build).
 */
function toSourceOption(music: Music): SourceOption {
  if (music.source === "library") return "library";
  if (music.source === "upload") return "url";
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

  const sourceOption = toSourceOption(music);

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

  function handleSourceChange(next: string) {
    stopPreview();
    if (next === "none") {
      updateMusic({ source: null, url: null, trackId: null });
    } else if (next === "library") {
      // Clear `url`, not just leave the previous value: `MusicPlayer`
      // resolves a "library" source's playable URL as `music.url ??
      // <fetched-by-trackId>` — a stale `url` left over from a previous
      // "upload"/pasted-URL source would otherwise make it play that old
      // URL instead of the (not yet chosen) library track.
      updateMusic({ source: "library", url: null });
    } else {
      // Symmetric with the "library" branch above: clear a stale `url`
      // left over from a previously-*chosen* library track too, so the
      // "Đường dẫn tệp nhạc" field starts empty rather than pre-filled
      // with someone else's library track URL.
      updateMusic({ source: "upload", trackId: null, url: null });
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
