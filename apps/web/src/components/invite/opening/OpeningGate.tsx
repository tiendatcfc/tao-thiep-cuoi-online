"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Opening } from "@hpwd/schema";
import { useInviteContext } from "../InviteContext";
import { CurtainOpening } from "./CurtainOpening";
import { EnvelopeOpening } from "./EnvelopeOpening";
import { FadeOpening } from "./FadeOpening";

export interface OpeningGateProps {
  opening: Opening;
  guestName: string | null;
  /**
   * Fired exactly once, the moment the invitation becomes visible/usable —
   * `InvitePage` uses this to flip `MusicPlayer`'s `startSignal`, its
   * FALLBACK path for starting music (also the only path for anything that
   * doesn't go through a tap — e.g. `effect: "none"`). By the time this
   * fires (after the variant's exit animation, or the safety net), strict
   * WebKit (iOS) may no longer consider it "within the user gesture" — see
   * `onTap` below for the path that actually is.
   */
  onOpened: () => void;
  /**
   * C1 fix: fired synchronously on the guest's raw tap, inside the SAME
   * call stack as the click event — before any animation runs. `InvitePage`
   * uses this to call `audio.play()` directly, which is what strict WebKit
   * requires for it to count as user-gesture-triggered playback. Optional:
   * `effect: "none"` never taps at all (children are visible immediately),
   * so this simply never fires in that case — `onOpened`'s startSignal path
   * is the only option there regardless.
   */
  onTap?: () => void;
  children: ReactNode;
}

/**
 * Gates the invitation body behind the configured opening effect
 * (`envelope` / `curtain` / `fade` / `none`) and owns the moment the guest's
 * first real tap happens.
 *
 * `children` stay mounted the whole time — for `envelope`/`curtain`/`fade`
 * they're simply wrapped in `aria-hidden="true"` + `inert` (hidden from
 * assistive tech, unfocusable, unclickable) rather than unmounted, both so
 * SSR still emits the full page and so nothing nested inside loses state
 * across the open. The overlay itself sits on top (`position: fixed`) and
 * visually covers them until opened.
 *
 * `effect: 'none'` skips the overlay outright: `opened` starts `true`, so
 * children are visible from the very first render. `onOpened` still fires,
 * but from an effect (never during render), guarded so it only ever runs
 * once — a parent that doesn't memoize its `onOpened` callback (this one's
 * `InvitePage` doesn't) will not see it called again on re-render.
 *
 * In preview mode (`isPreview` from `InviteContext`) the gate gets out of
 * the way entirely: children render immediately, un-hidden, and `onOpened`
 * is never called — an editor iterating on their design shouldn't have to
 * tap through an envelope on every re-render, and preview must never kick
 * off the guest-facing autoplay chain.
 */
export function OpeningGate({ opening, guestName, onOpened, onTap, children }: OpeningGateProps) {
  const { isPreview } = useInviteContext();
  const [opened, setOpened] = useState(opening.effect === "none");
  const firedRef = useRef(false);

  useEffect(() => {
    if (isPreview || !opened || firedRef.current) return;
    firedRef.current = true;
    onOpened();
  }, [opened, isPreview, onOpened]);

  if (isPreview) {
    return <>{children}</>;
  }

  function handleOpen() {
    setOpened(true);
  }

  return (
    <>
      <div aria-hidden={!opened} inert={opened ? undefined : true}>
        {children}
      </div>
      {!opened && opening.effect === "envelope" ? (
        <EnvelopeOpening opening={opening} guestName={guestName} onOpen={handleOpen} onTap={onTap} />
      ) : null}
      {!opened && opening.effect === "curtain" ? (
        <CurtainOpening opening={opening} guestName={guestName} onOpen={handleOpen} onTap={onTap} />
      ) : null}
      {!opened && opening.effect === "fade" ? (
        <FadeOpening opening={opening} guestName={guestName} onOpen={handleOpen} onTap={onTap} />
      ) : null}
    </>
  );
}
