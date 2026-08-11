"use client";

import { motion, useReducedMotion } from "framer-motion";
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
export function CurtainOpening({ opening, guestName, onOpen }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
  );
  const t = (base: number) => (reduceMotion ? 0 : base);

  return (
    <motion.div
      className="fixed inset-0 z-30 overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: t(FADE_DURATION), delay: t(FADE_DELAY) }}
      onAnimationComplete={handleAnimationComplete}
    >
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2 bg-[var(--primary)]"
        initial={{ x: "0%" }}
        animate={{ x: tapped ? "-100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION) }}
      />
      <motion.div
        className="absolute inset-y-0 right-0 w-1/2 bg-[var(--secondary)]"
        initial={{ x: "0%" }}
        animate={{ x: tapped ? "100%" : "0%" }}
        transition={{ duration: t(PANEL_DURATION) }}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
        {opening.monogram ? (
          <p className="text-2xl font-semibold tracking-wide text-white drop-shadow">{opening.monogram}</p>
        ) : null}
        {opening.showGuestName && guestName ? (
          <p className="text-sm text-white/90 drop-shadow">Kính mời: {guestName}</p>
        ) : null}
        <button
          type="button"
          onClick={handleTap}
          disabled={tapped}
          aria-label="Mở thiệp"
          className="pointer-events-auto rounded-full bg-white px-8 py-3 text-sm font-medium text-[var(--primary)] shadow-lg transition-transform active:scale-95"
        >
          Mở thiệp
        </button>
      </div>
    </motion.div>
  );
}
