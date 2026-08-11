"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const FLAP_DURATION = 0.35;
const CARD_DURATION = 0.25;
const CARD_DELAY = 0.3;
const FADE_DURATION = 0.25;
const FADE_DELAY = 0.55;
const TOTAL_DURATION_MS = 800;
// Total: 0.55 + 0.25 = 0.8s — under the 1.2s budget.

/**
 * A centered envelope built entirely from CSS shapes (no images): a body
 * rectangle, a triangular flap that rotates open about its top edge
 * (`rotateX`, `transform-origin: top`, `preserve-3d`/`perspective`), and an
 * inner card that slides up out of it. The monogram sits near the top of
 * the closed envelope (visually "on the flap") and, when configured, the
 * guest's name is shown on the card underneath. The whole envelope graphic
 * is itself the `<button>` — full-envelope tap target, with an explicit
 * `aria-label` so its accessible name stays "Mở thiệp" regardless of what
 * dynamic monogram/guest-name text renders inside it.
 *
 * Content inside the button uses `<span>`, not `<p>` — a `<button>`'s
 * content model only permits phrasing content, and `<p>` is block-level.
 */
export function EnvelopeOpening({ opening, guestName, onOpen }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
  );
  const t = (base: number) => (reduceMotion ? 0 : base);

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[var(--background)] px-6"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: t(FADE_DURATION), delay: t(FADE_DELAY) }}
      onAnimationComplete={handleAnimationComplete}
    >
      <button
        type="button"
        onClick={handleTap}
        disabled={tapped}
        aria-label="Mở thiệp"
        className="relative h-56 w-72"
        style={{ perspective: 1200 }}
      >
        <div className="absolute inset-x-0 bottom-0 h-44 rounded-b-md bg-[var(--secondary)] shadow-xl" />
        <motion.div
          className="absolute inset-x-0 top-0 h-32 origin-top bg-[var(--primary)]"
          style={{
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
          }}
          animate={{ rotateX: tapped ? 180 : 0 }}
          transition={{ duration: t(FLAP_DURATION) }}
        />
        {opening.monogram ? (
          <span className="pointer-events-none absolute inset-x-0 top-3 z-10 block text-center text-xl font-semibold text-white drop-shadow">
            {opening.monogram}
          </span>
        ) : null}
        <motion.div
          className="absolute inset-x-6 bottom-4 flex flex-col items-center justify-center gap-1 rounded bg-white/95 px-4 py-5 text-center shadow-md"
          initial={{ y: 0 }}
          animate={{ y: tapped ? -56 : 0 }}
          transition={{ duration: t(CARD_DURATION), delay: t(CARD_DELAY) }}
        >
          {opening.showGuestName && guestName ? (
            <span className="block text-sm text-gray-700">Kính mời: {guestName}</span>
          ) : null}
        </motion.div>
      </button>
      <span className="rounded-full bg-[var(--primary)] px-8 py-3 text-sm font-medium text-white shadow-lg">
        Mở thiệp
      </span>
    </motion.div>
  );
}
