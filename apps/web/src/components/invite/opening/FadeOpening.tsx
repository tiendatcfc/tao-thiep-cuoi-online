"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { OpeningVariantProps } from "./types";

const FADE_DURATION = 0.5; // seconds — well under the 1.2s total budget.

/**
 * Simplest of the three opening effects: a full-screen `--background`
 * overlay showing the monogram/guest-name that just fades to transparent on
 * tap, revealing the invitation underneath. `onOpen` fires once that fade
 * finishes (`onAnimationComplete`), not on the raw click.
 */
export function FadeOpening({ opening, guestName, onOpen }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const [tapped, setTapped] = useState(false);

  function handleTap() {
    if (tapped) return;
    setTapped(true);
  }

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[var(--background)] px-6 text-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0 : FADE_DURATION }}
      onAnimationComplete={() => {
        if (tapped) onOpen();
      }}
    >
      {opening.monogram ? (
        <p className="text-2xl font-semibold tracking-wide text-[var(--primary)]">{opening.monogram}</p>
      ) : null}
      {opening.showGuestName && guestName ? (
        <p className="text-sm text-gray-600">Kính mời: {guestName}</p>
      ) : null}
      <button
        type="button"
        onClick={handleTap}
        disabled={tapped}
        aria-label="Mở thiệp"
        className="rounded-full bg-[var(--primary)] px-8 py-3 text-sm font-medium text-white shadow-lg transition-transform active:scale-95"
      >
        Mở thiệp
      </button>
    </motion.div>
  );
}
