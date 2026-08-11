"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Music } from "@hpwd/schema";
import { useInviteContext } from "./InviteContext";

interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
  category: string;
}

export interface MusicPlayerProps {
  music: Music;
  /**
   * Flips false → true on the guest's tap during Task 13's opening-gate
   * animation — that tap is the user-gesture browsers require before audio
   * is allowed to autoplay. Only the *transition* triggers `audio.play()`;
   * an already-true value at mount (or any later re-render) never does.
   */
  startSignal: boolean;
}

/**
 * Sticky circular toggle button, bottom-right, plus the `<audio>` element it
 * controls. Renders nothing at all when there's no music configured or no
 * URL could be resolved for it — the invitation must never break or show a
 * broken player over a music misconfiguration.
 *
 * Source resolution:
 * - `source: null` → nothing to play.
 * - `source: "upload"` → `music.url` directly.
 * - `source: "library"` → `music.url` if the document already has it
 *   (e.g. denormalized at publish time); otherwise fetched from
 *   `GET /api/music` by `music.trackId` on mount.
 *
 * Autoplay policy: `audio.play()` is only ever called (a) when `startSignal`
 * transitions false → true, gated off entirely in preview mode
 * (`isPreview` from `InviteContext`) so editors don't get surprise audio, or
 * (b) from the button's own click handler. Never via the `autoPlay`
 * attribute. A rejected play promise (the browser refusing anyway) just
 * rolls the UI back to paused — it never throws or crashes the page.
 */
export function MusicPlayer({ music, startSignal }: MusicPlayerProps) {
  const { isPreview } = useInviteContext();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevStartSignalRef = useRef(startSignal);

  const [playing, setPlaying] = useState(false);
  const [libraryUrl, setLibraryUrl] = useState<string | null>(null);

  useEffect(() => {
    if (music.source !== "library" || music.url || !music.trackId) return;
    const trackId = music.trackId;
    let cancelled = false;

    fetch("/api/music")
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/music failed with status ${res.status}`);
        return res.json() as Promise<{ tracks: LibraryTrack[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const track = data.tracks.find((candidate) => candidate.id === trackId);
        if (!track) {
          console.warn(`MusicPlayer: library track "${trackId}" not found or inactive.`);
          return;
        }
        setLibraryUrl(track.url);
      })
      .catch((error) => {
        if (!cancelled) console.warn("MusicPlayer: failed to resolve library track.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [music.source, music.url, music.trackId]);

  const playAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaying(true);
    audio.play().catch(() => setPlaying(false));
  }, []);

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Fires `play()` exactly on the false→true transition, never on mount and
  // never again for a value that was already true.
  useEffect(() => {
    const isRisingEdge = !prevStartSignalRef.current && startSignal;
    prevStartSignalRef.current = startSignal;
    if (!isRisingEdge || isPreview) return;
    playAudio();
  }, [startSignal, isPreview, playAudio]);

  function handleToggle() {
    if (playing) pauseAudio();
    else playAudio();
  }

  const directUrl = music.source === "upload" || music.source === "library" ? music.url : null;
  const resolvedUrl = directUrl ?? libraryUrl;

  // Changing an <audio> element's `src` attribute doesn't reliably make the
  // browser pick up the new resource on its own — that needs an explicit
  // `load()`. Not exercised by anything today, but the editor's live
  // preview (Task 15/16) re-renders this same mounted component whenever
  // the couple picks a different track in `MusicPanel`, so this keeps that
  // case correct now rather than as a bug to rediscover later.
  useEffect(() => {
    audioRef.current?.load();
  }, [resolvedUrl]);

  if (music.source === null || !resolvedUrl) return null;

  return (
    <>
      <audio ref={audioRef} src={resolvedUrl} preload="none" loop />
      <button
        type="button"
        onClick={handleToggle}
        aria-label={playing ? "Tắt nhạc" : "Bật nhạc"}
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition-transform active:scale-95"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={playing ? "h-5 w-5 motion-safe:animate-[spin_3s_linear_infinite]" : "h-5 w-5"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 18V5l11-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM20 15a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z"
          />
        </svg>
      </button>
    </>
  );
}
