"use client";

import { m, useReducedMotion } from "framer-motion";
import { OpeningCaption, OpeningCta } from "./OpeningContent";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const PANEL_DURATION = 0.5;
const FADE_DURATION = 0.3;
const FADE_DELAY = 0.35;
const TOTAL_DURATION_MS = 650;
// Total: 0.35 + 0.3 = 0.65s — well under the 1.2s budget.

/**
 * Two solid panels covering the left/right halves of the screen slide apart
 * on tap; the whole overlay (panels + monogram/guest-name/button) then
 * fades away once the panels are clear, calling `onOpen` from that final
 * fade's `onAnimationComplete`.
 */
export function CurtainOpening({ opening, guestName, identity = null, onOpen, onTap }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
    onTap,
  );
  const t = (base: number) => (reduceMotion ? 0 : base);

  return (
    <m.div
      data-opening-gate
      className="fixed inset-0 z-30 overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: t(FADE_DURATION), delay: t(FADE_DELAY) }}
      onAnimationComplete={handleAnimationComplete}
    >
      <m.div
        className="absolute inset-y-0 left-0 w-1/2 bg-[var(--primary)]"
        initial={{ x: "0%" }}
        animate={{ x: tapped ? "-100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION) }}
      />
      <m.div
        className="absolute inset-y-0 right-0 w-1/2 bg-[var(--secondary)]"
        initial={{ x: "0%" }}
        animate={{ x: tapped ? "100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION) }}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
        {/* `onColor`: this content sits on the two solid panels, which
            are the couple's own primary/secondary — the paper ink tokens
            would be unreadable there. */}
        <OpeningCaption opening={opening} guestName={guestName} identity={identity} tone="onColor" />
        <button
          type="button"
          onClick={handleTap}
          disabled={tapped}
          aria-label="Mở thiệp"
          className="pointer-events-auto mt-2 rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-95"
        >
          <OpeningCta tone="onColor" />
        </button>
      </div>
    </m.div>
  );
}
