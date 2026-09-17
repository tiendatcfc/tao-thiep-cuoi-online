"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const GATHER_DURATION = 0.5;
const FADE_DURATION = 0.25;
const FADE_DELAY = 0.5;
const TOTAL_DURATION_MS = 750;
// Total: 0.5 + 0.25 = 0.75s — inside the project's 1.2s opening budget.

/**
 * Petal positions are a FIXED table, not `Math.random()` calls.
 *
 * Randomising during render would give the server and the client different
 * markup and produce a hydration mismatch — the class of bug this project
 * has already hit three times. Generating them in an effect instead would
 * avoid that but leave the overlay visibly empty on first paint, which is
 * the first thing every guest sees. A hand-written table is deterministic,
 * reviewable, and costs nothing at runtime.
 *
 * `left`/`top` are viewport percentages; `dur` staggers the idle drift so
 * the petals do not pulse in unison.
 */
const PETALS = [
  { left: 6, top: 10, size: 16, rotate: -25, dur: 3.4, tint: "var(--secondary)" },
  { left: 18, top: 26, size: 11, rotate: 40, dur: 4.1, tint: "var(--primary)" },
  { left: 29, top: 6, size: 13, rotate: -10, dur: 3.7, tint: "var(--secondary)" },
  { left: 41, top: 20, size: 9, rotate: 65, dur: 4.6, tint: "var(--primary)" },
  { left: 53, top: 9, size: 15, rotate: -45, dur: 3.2, tint: "var(--secondary)" },
  { left: 66, top: 24, size: 12, rotate: 15, dur: 4.3, tint: "var(--primary)" },
  { left: 78, top: 8, size: 14, rotate: -60, dur: 3.9, tint: "var(--secondary)" },
  { left: 90, top: 19, size: 10, rotate: 30, dur: 4.8, tint: "var(--primary)" },
  { left: 10, top: 48, size: 12, rotate: 55, dur: 4.4, tint: "var(--primary)" },
  { left: 24, top: 62, size: 15, rotate: -35, dur: 3.5, tint: "var(--secondary)" },
  { left: 37, top: 76, size: 10, rotate: 20, dur: 4.2, tint: "var(--primary)" },
  { left: 49, top: 57, size: 13, rotate: -50, dur: 3.8, tint: "var(--secondary)" },
  { left: 62, top: 71, size: 11, rotate: 70, dur: 4.7, tint: "var(--primary)" },
  { left: 74, top: 54, size: 16, rotate: -15, dur: 3.3, tint: "var(--secondary)" },
  { left: 86, top: 68, size: 12, rotate: 45, dur: 4.5, tint: "var(--primary)" },
  { left: 94, top: 86, size: 10, rotate: -70, dur: 4.0, tint: "var(--secondary)" },
];

/**
 * A softly veiled invitation behind a scatter of drifting petals; on tap
 * every petal sweeps toward the centre, shrinking away, and the veil fades
 * off the invitation.
 *
 * Distinct from `opening.particles: "petals"`, which is the decorative
 * canvas that keeps falling over the invitation AFTER it opens. This is the
 * gate itself, and the two are independent settings.
 *
 * `onOpen` comes from `useOpeningTap` — see `RevealOpening` for why the
 * animation callback is never the only path.
 */
export function PetalsOpening({ opening, guestName, onOpen, onTap }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
    onTap,
  );
  const t = (base: number) => (reduceMotion ? 0 : base);

  return (
    <motion.div
      className="fixed inset-0 z-30 overflow-hidden bg-[var(--background)]/95 backdrop-blur-sm"
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: t(FADE_DURATION), delay: t(FADE_DELAY) }}
      onAnimationComplete={handleAnimationComplete}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {PETALS.map((petal) => (
          <motion.span
            key={`${petal.left}-${petal.top}`}
            className="absolute block opacity-70"
            style={{
              left: `${petal.left}%`,
              top: `${petal.top}%`,
              width: petal.size,
              height: petal.size,
              background: petal.tint,
              // A single rounded corner pair reads as a petal silhouette
              // without needing an SVG per element.
              borderRadius: "60% 0 60% 0",
            }}
            // `x`/`y` start in the same viewport units the gather animates
            // to; starting from a unitless 0 would make framer-motion
            // interpolate px against vw and jump.
            initial={{ x: "0vw", y: "0vh", rotate: petal.rotate }}
            animate={
              tapped
                ? {
                    x: `${50 - petal.left}vw`,
                    y: `${50 - petal.top}vh`,
                    rotate: petal.rotate + 180,
                    scale: 0,
                    opacity: 0,
                  }
                : reduceMotion
                  ? { x: "0vw", y: "0vh", rotate: petal.rotate }
                  : { x: "0vw", y: ["0vh", "2vh", "0vh"], rotate: [petal.rotate, petal.rotate + 14, petal.rotate] }
            }
            transition={
              tapped
                ? { duration: t(GATHER_DURATION), ease: "easeIn" }
                : reduceMotion
                  ? { duration: 0 }
                  : { duration: petal.dur, repeat: Infinity, ease: "easeInOut" }
            }
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
        {opening.monogram ? (
          <p className="text-3xl font-semibold tracking-[0.2em] text-[var(--primary)]">{opening.monogram}</p>
        ) : null}
        {opening.showGuestName && guestName ? (
          <p className="text-sm text-gray-600">Kính mời: {guestName}</p>
        ) : null}
        <button
          type="button"
          onClick={handleTap}
          disabled={tapped}
          aria-label="Mở thiệp"
          className="pointer-events-auto rounded-full bg-[var(--primary)] px-8 py-3 text-sm font-medium text-white shadow-lg transition-transform active:scale-95"
        >
          Mở thiệp
        </button>
      </div>
    </motion.div>
  );
}
