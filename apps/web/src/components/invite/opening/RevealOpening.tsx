"use client";

import { m, useReducedMotion } from "framer-motion";
import { OpeningCaption, OpeningCta } from "./OpeningContent";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const PANEL_DURATION = 0.55;
const FADE_DURATION = 0.15;
const FADE_DELAY = 0.55;
const TOTAL_DURATION_MS = 700;
// Total: 0.55 + 0.15 = 0.70s — inside the project's 1.2s opening budget.

/**
 * A solid cover split across the middle: the top half slides up and the
 * bottom half slides down, uncovering the invitation between them.
 *
 * The monogram rides the upper panel and the button rides the lower one,
 * rather than both sitting centred across the seam — centred content would
 * be sliced in half the instant the panels part, which reads as a glitch
 * rather than as a reveal.
 *
 * As with the other variants, `onOpen` comes from `useOpeningTap`, never
 * directly from `onAnimationComplete`: that callback is missed whenever the
 * tab is backgrounded mid-animation, and a guest left behind a disabled
 * button with an `inert` invitation underneath has no way to recover.
 */
export function RevealOpening({ opening, guestName, identity = null, onOpen, onTap }: OpeningVariantProps) {
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
        className="absolute inset-x-0 top-0 flex h-1/2 flex-col items-center justify-end gap-3 bg-[var(--background)] px-6 pb-8 text-center"
        initial={{ y: "0%" }}
        animate={{ y: tapped ? "-100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION), ease: "easeInOut" }}
      >
        {/* Kept even though `OpeningCaption` now guarantees the panel is
            never empty: this effect's upper half is bottom-aligned against
            the seam, and the ornament is what gives the type something to
            sit on instead of ending flush against a bare hairline. */}
        <div aria-hidden="true" data-opening-ornament className="flex items-center gap-3">
          <span className="h-px w-10 bg-[var(--secondary)]" />
          <span className="h-2 w-2 rotate-45 bg-[var(--primary)]" />
          <span className="h-px w-10 bg-[var(--secondary)]" />
        </div>
        <OpeningCaption opening={opening} guestName={guestName} identity={identity} tone="ink" />
      </m.div>

      {/* The seam itself: a hairline in the accent colour so the split reads
          as deliberate before anything moves. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--secondary)]" />

      <m.div
        className="absolute inset-x-0 bottom-0 flex h-1/2 flex-col items-center justify-start gap-3 bg-[var(--background)] px-6 pt-8 text-center"
        initial={{ y: "0%" }}
        animate={{ y: tapped ? "100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION), ease: "easeInOut" }}
      >
        <button
          type="button"
          onClick={handleTap}
          disabled={tapped}
          aria-label="Mở thiệp"
          className="rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] active:scale-95"
        >
          <OpeningCta tone="ink" />
        </button>
      </m.div>
    </m.div>
  );
}
