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
 */
export function useOpeningTap(onOpen: () => void, animationMs: number): UseOpeningTapResult {
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
