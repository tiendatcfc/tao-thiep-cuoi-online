"use client";

import { useEffect, useRef, useState } from "react";

export interface UseOpeningTapResult {
  tapped: boolean;
  handleTap: () => void;
  handleAnimationComplete: () => void;
}

/**
 * Shared tap-to-open state machine for the three opening-effect variants
 * (Envelope/Curtain/Fade).
 *
 * The normal path to `onOpen` is framer-motion's `onAnimationComplete`
 * firing once the variant's own exit animation finishes — wire it to
 * `handleAnimationComplete`. But that callback can be missed entirely: the
 * tab gets backgrounded mid-animation, the animation gets interrupted, an
 * unrelated JS error fires elsewhere on the page. A guest left behind a
 * `disabled` button with the real invitation permanently `aria-hidden` +
 * `inert` underneath has no way to recover — so `handleTap` also arms a
 * `setTimeout` safety net that calls `onOpen` on its own if the animation
 * callback doesn't show up within `animationMs + 400`ms of the tap.
 * Whichever path fires first wins; `firedRef` guarantees `onOpen` never
 * runs twice no matter which one (or both) get invoked.
 *
 * Under `prefers-reduced-motion` the caller passes `animationMs: 0` — the
 * `onAnimationComplete` path already fires essentially immediately in that
 * case (duration-0 transitions still call it), so the safety net firing
 * ~400ms later in the case it's ever needed is harmless.
 *
 * `onTap` (C1 fix) is a THIRD, distinct callback from `onOpen`: it fires
 * synchronously, as the very first statement inside `handleTap`, in the
 * SAME call stack as the click event itself — nothing here defers it past
 * a `setState`, a `setTimeout`, or an animation callback. `InvitePage` uses
 * it to call `audio.play()` directly from the tap. Strict WebKit (iOS
 * Safari/WebViews) only honors `play()` as "triggered by a user gesture"
 * while still inside that same synchronous gesture-handling window —
 * `onOpen`, which fires ~1s later via `onAnimationComplete` or the safety
 * net, is well outside it, which is why music configured to start on open
 * silently never started on iOS. `onTap` is optional so components that
 * don't need it (tests, most call sites before this fix existed) don't
 * have to pass one.
 */
export function useOpeningTap(onOpen: () => void, animationMs: number, onTap?: () => void): UseOpeningTapResult {
  const [tapped, setTapped] = useState(false);
  const firedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPendingTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function fireOnce() {
    if (firedRef.current) return;
    firedRef.current = true;
    clearPendingTimeout();
    onOpen();
  }

  function handleTap() {
    if (tapped) return;
    // Must run before `setTapped` (or anything else) — see this function's
    // docstring on `onTap` for why the ordering/synchronicity matters.
    onTap?.();
    setTapped(true);
    timeoutRef.current = setTimeout(fireOnce, animationMs + 400);
  }

  function handleAnimationComplete() {
    if (tapped) fireOnce();
  }

  useEffect(() => {
    return clearPendingTimeout;
  }, []);

  return { tapped, handleTap, handleAnimationComplete };
}
