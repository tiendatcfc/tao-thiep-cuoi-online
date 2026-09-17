"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Opening } from "@hpwd/schema";
import { useInviteContext } from "../InviteContext";
import { CurtainOpening } from "./CurtainOpening";
import { EnvelopeOpening } from "./EnvelopeOpening";
import { FadeOpening } from "./FadeOpening";
import { PetalsOpening } from "./PetalsOpening";
import { RevealOpening } from "./RevealOpening";
import type { OpeningVariantProps } from "./types";

/**
 * One component per effect the schema allows, `none` excepted (it has no
 * overlay at all).
 *
 * Written as a total mapping rather than a chain of `effect === "..."`
 * checks: the `Exclude<Opening["effect"], "none">` key type makes adding a
 * value to `OpeningSchema`'s enum without a component here a COMPILE error.
 * With the previous if-chain, a missing effect rendered nothing — an
 * invisible overlay over an `inert` invitation, i.e. a blank page the guest
 * can neither read nor dismiss.
 */
const OPENING_VARIANTS: Record<Exclude<Opening["effect"], "none">, ComponentType<OpeningVariantProps>> = {
  envelope: EnvelopeOpening,
  curtain: CurtainOpening,
  fade: FadeOpening,
  reveal: RevealOpening,
  petals: PetalsOpening,
};

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
 * Gates the invitation body behind the configured opening effect (any key
 * of `OPENING_VARIANTS` above, or `none`) and owns the moment the guest's
 * first real tap happens.
 *
 * `children` stay mounted the whole time — for every effect but `none`
 * they're simply wrapped in `aria-hidden="true"` + `inert` (hidden from
 * assistive tech, unfocusable, unclickable) rather than unmounted, both so
 * SSR still emits the full page and so nothing nested inside loses state
 * across the open. The overlay itself sits on top (`position: fixed`) and
 * visually covers them until opened. Those two attributes are only ever
 * applied post-hydration (Task 4) — see the `hydrated` state below for why.
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

  // Task 4 fix: `aria-hidden`/`inert` are deliberately NOT server-rendered.
  // `inert` is a real HTML attribute — no `<noscript>` stylesheet can strip
  // it — so SSRing it would permanently trap a guest without JavaScript
  // behind the (JS-only) opening overlay: its button never gets a click
  // handler, so `opened` can never flip and the content stays inert forever.
  // Deferring both attributes to one paint after hydration keeps the exact
  // same guarantees for JS-enabled guests: the opaque, `position: fixed`
  // overlay already covers the content visually during that brief window.
  // Without JS, the content simply renders un-gated, and `app/i/layout.tsx`'s
  // noscript CSS hides the (now non-functional) overlay instead.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (isPreview || !opened || firedRef.current) return;
    firedRef.current = true;
    onOpened();
  }, [opened, isPreview, onOpened]);

  // C7 fix: `children` stay mounted (in normal document flow) under
  // `inert` while the gate is closed — `inert` blocks focus and click, but
  // NOT scroll, so a guest could swipe/scroll the page behind the (fixed,
  // full-screen) opening overlay. That both lets them see content they
  // haven't "opened" yet and burns the scroll-triggered reveal animations
  // (`once: true`) on sections they never consciously scrolled past,
  // leaving those sections permanently already-revealed once the gate does
  // open. Locking `document.body`'s scroll while closed prevents both.
  // Never applied in preview (isPreview short-circuits below anyway) or
  // once opened.
  useEffect(() => {
    if (isPreview || opened) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreview, opened]);

  if (isPreview) {
    return <>{children}</>;
  }

  function handleOpen() {
    setOpened(true);
  }

  const Variant = opening.effect === "none" ? null : OPENING_VARIANTS[opening.effect];

  return (
    <>
      <div
        data-opening-content
        aria-hidden={hydrated && !opened ? true : undefined}
        inert={hydrated && !opened ? true : undefined}
      >
        {children}
      </div>
      <div data-opening-overlay>
        {!opened && Variant ? (
          <Variant opening={opening} guestName={guestName} onOpen={handleOpen} onTap={onTap} />
        ) : null}
      </div>
    </>
  );
}
