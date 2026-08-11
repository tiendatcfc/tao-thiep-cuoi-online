"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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
   * Flips false → true once the opening gate has fully opened — the
   * FALLBACK path for starting music, for anything that isn't a direct tap
   * (`effect: "none"`), or a genuine "missed the gesture window" case. Only
   * the *transition* triggers `audio.play()`; an already-true value at
   * mount (or any later re-render) never does.
   *
   * By the time this fires (after the opening variant's own exit animation
   * — see `OpeningGate`'s `onOpened`), strict WebKit (iOS Safari/WebViews)
   * may no longer consider the call "triggered by a user gesture" and
   * silently reject `play()` — that's what `MusicPlayerHandle.play` (via
   * `ref`) exists to avoid: `InvitePage` calls it directly, synchronously,
   * from the guest's raw tap (`OpeningGate`'s `onTap`), which IS still
   * inside the gesture window. This prop stays as the fallback/non-gesture
   * path; it does NOT reliably start music on iOS on its own.
   */
  startSignal: boolean;
  /**
   * C7 fix: whether the guest can currently see/tap the toggle button.
   * Defaults to `true` — every existing caller (including every test) that
   * doesn't pass this keeps working unchanged. `InvitePage` passes
   * `opened || isPreview`: this button is `fixed`, `z-50`, and rendered as
   * a SIBLING of `OpeningGate`'s overlay (never inside its `inert` wrapper,
   * by design — see `InvitePage`'s own comment on why `MusicPlayer` must
   * stay mounted throughout), so without this it sat visually ABOVE the
   * `z-30` opening overlay and stayed fully tappable/focusable even before
   * the guest had opened anything.
   */
  interactive?: boolean;
}

export interface MusicPlayerHandle {
  /** Imperative escape hatch for starting playback synchronously from within a real user-gesture call stack — see `startSignal`'s docstring above for why this exists at all. Safe to call before the `<audio>` element exists yet (e.g. `resolvedUrl` still resolving); it's a no-op until then. */
  play: () => void;
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
 * transitions false → true (see its own docstring on why this alone is
 * unreliable on iOS), (b) imperatively via `ref.current.play()` — see
 * `MusicPlayerHandle` — or (c) from the button's own click handler. Never
 * via the `autoPlay` attribute. Gated off entirely in preview mode
 * (`isPreview` from `InviteContext`) so editors don't get surprise audio. A
 * rejected play promise (the browser refusing anyway) just rolls the UI
 * back to paused — it never throws or crashes the page.
 */
export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(function MusicPlayer(
  { music, startSignal, interactive = true },
  ref,
) {
  const { isPreview } = useInviteContext();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevStartSignalRef = useRef(startSignal);

  const [playing, setPlaying] = useState(false);
  const [libraryUrl, setLibraryUrl] = useState<string | null>(null);

  useEffect(() => {
    if (music.source !== "library" || music.url) return;
    if (!music.trackId) {
      console.warn("MusicPlayer: library source has neither url nor trackId set — nothing to resolve.");
      return;
    }
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

  // C1: exposes `playAudio` imperatively so `InvitePage` can call it
  // synchronously from the opening gate's raw tap handler — see
  // `MusicPlayerHandle`'s and `startSignal`'s docstrings above for why that
  // matters on iOS. `audioRef.current` may still be `null` here if
  // `resolvedUrl` hasn't resolved yet (an async library-track lookup) —
  // `playAudio` already no-ops in that case, same as it would for any other
  // caller.
  useImperativeHandle(ref, () => ({ play: playAudio }), [playAudio]);

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

  // A guest who starts music and then navigates away (e.g. the "Tạo miễn
  // phí tại HPWD" badge link right below this component) triggers a
  // client-side route change that unmounts this component — without this,
  // the <audio> element (and its playback) would keep going on the old page
  // in the background since nothing ever told it to stop.
  //
  // The element is captured into a local here, at setup time, rather than
  // re-read from `audioRef.current` inside the cleanup: React detaches refs
  // (sets them back to `null`) before running passive-effect cleanups on a
  // real unmount, so reading the ref *inside* the cleanup would already see
  // `null` and silently no-op. Keying on `resolvedUrl` (instead of `[]`)
  // also makes this work when the element only mounts later, once a
  // library track's URL resolves asynchronously.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    };
  }, [resolvedUrl]);

  if (music.source === null || !resolvedUrl) return null;

  return (
    <>
      <audio ref={audioRef} src={resolvedUrl} preload="none" loop />
      <button
        type="button"
        onClick={handleToggle}
        // C7 fix: `disabled` (blocks click) + `tabIndex={-1}` (removes it
        // from keyboard tab order) + `aria-hidden` (removes it from the
        // accessibility tree) + `invisible` (hides it, but — unlike
        // `hidden`/`display:none` — keeps its layout box, so nothing shifts
        // when it reappears) together fully withdraw the button from
        // interaction while the opening overlay is still covering it.
        disabled={!interactive}
        tabIndex={interactive ? 0 : -1}
        aria-hidden={!interactive}
        aria-label={playing ? "Tắt nhạc" : "Bật nhạc"}
        className={`fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition-transform active:scale-95 ${
          interactive ? "" : "invisible"
        }`}
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
});
