"use client";

import { m, useReducedMotion } from "framer-motion";
import { OpeningCaption, OpeningCta } from "./OpeningContent";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const FADE_DURATION = 0.5; // seconds — well under the 1.2s total budget.
const TOTAL_DURATION_MS = 500;

/**
 * Simplest of the three opening effects: a full-screen `--background`
 * overlay showing the monogram/guest-name that just fades to transparent on
 * tap, revealing the invitation underneath. `onOpen` fires once that fade
 * finishes (`onAnimationComplete`), not on the raw click.
 */
export function FadeOpening({ opening, guestName, identity = null, onOpen, onTap }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
    onTap,
  );

  return (
    <m.div
      data-opening-gate
      /* Same reasoning as `EnvelopeOpening`: centring content taller than
         a fixed container makes its top unreachable. */
      className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-[var(--background)] text-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0 : FADE_DURATION }}
      onAnimationComplete={handleAnimationComplete}
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-8">
      <OpeningCaption opening={opening} guestName={guestName} identity={identity} tone="ink" />
      <button
        type="button"
        onClick={handleTap}
        disabled={tapped}
        aria-label="Mở thiệp"
        className="mt-2 rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] active:scale-95"
      >
        <OpeningCta tone="ink" />
      </button>
      </div>
    </m.div>
  );
}
