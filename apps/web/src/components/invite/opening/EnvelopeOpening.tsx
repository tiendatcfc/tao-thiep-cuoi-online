"use client";

import { m, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { OpeningCaption, OpeningCta, openingSigil } from "./OpeningContent";
import type { OpeningVariantProps } from "./types";
import { useOpeningTap } from "./useOpeningTap";

const FLAP_DURATION = 0.35;
const CARD_DURATION = 0.25;
const CARD_DELAY = 0.3;
const FADE_DURATION = 0.25;
const FADE_DELAY = 0.55;
const TOTAL_DURATION_MS = 800;
// Total: 0.55 + 0.25 = 0.8s — under the 1.2s budget. These five constants
// are load-bearing beyond the look: `useOpeningTap`'s safety net is armed
// at `TOTAL_DURATION_MS + 400`, so shortening the animation without
// shortening this number just makes a guest wait longer when the animation
// callback goes missing.

/**
 * The invitation card, with its envelope flap folded over the top of it.
 *
 * The previous version was a literal envelope — a filled rectangle, a
 * triangle, and a blank white card peeking out — with the couple's
 * monogram as the only text. Since `createDefaultDocument` leaves the
 * monogram empty, most guests met a maroon triangle on a white screen and
 * a pill that said "Mở thiệp", which is what prompted this redesign.
 *
 * Inverting it fixes both problems at once: the card is the whole
 * composition and is printed with the couple's names, their date and the
 * guest's name from the first frame, and the flap is a fold across its top
 * rather than a lid hiding it. Nothing is withheld until the tap, and the
 * tap still does something worth watching — the flap swings open about its
 * top edge, the card lifts away, the screen fades.
 *
 * Colour discipline: `--primary`/`--secondary`/`--background` are whatever
 * the couple chose, so every surface here is mixed against their own
 * background with `color-mix()` instead of being tinted with a hardcoded
 * value that would only work for the demo's palette.
 *
 * The whole composition is ONE `<button>` — the largest tap target a phone
 * can offer — with an explicit `aria-label`, so its accessible name stays
 * "Mở thiệp" no matter what names render inside it. That also means every
 * descendant must be phrasing content: `<span>`, never `<p>` or `<div>`.
 */
export function EnvelopeOpening({ opening, guestName, identity = null, onOpen, onTap }: OpeningVariantProps) {
  const reduceMotion = useReducedMotion();
  const { tapped, handleTap, handleAnimationComplete } = useOpeningTap(
    onOpen,
    reduceMotion ? 0 : TOTAL_DURATION_MS,
    onTap,
  );
  const t = (base: number) => (reduceMotion ? 0 : base);

  const sigil = openingSigil(opening, identity);

  /** A wash of the couple's secondary colour at the top, falling away to their plain background: depth without inventing a colour they did not pick. */
  const backdropStyle: CSSProperties = {
    backgroundColor: "var(--background)",
    backgroundImage:
      "radial-gradient(120% 78% at 50% 2%, color-mix(in oklab, var(--secondary) 34%, var(--background)) 0%, var(--background) 62%)",
  };

  const cardStyle: CSSProperties = {
    borderRadius: "var(--radius-paper)",
    boxShadow: "var(--shadow-lift)",
    border: "1px solid color-mix(in oklab, var(--primary) 14%, transparent)",
    backgroundImage:
      "linear-gradient(176deg, color-mix(in oklab, var(--background) 96%, white) 0%, color-mix(in oklab, var(--secondary) 13%, var(--background)) 100%)",
  };

  const flapStyle: CSSProperties = {
    clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
    backgroundImage:
      "linear-gradient(166deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, color-mix(in oklab, var(--primary) 86%, black) 100%)",
    transformStyle: "preserve-3d",
    // The flap's reverse side is the inside of an envelope, which is not
    // something to render — hiding it means the flap simply ceases to
    // exist once it passes 90°, which is exactly how a real one leaves
    // the frame.
    backfaceVisibility: "hidden",
  };

  const sealStyle: CSSProperties = {
    backgroundColor: "color-mix(in oklab, var(--background) 90%, white)",
    border: "1px solid color-mix(in oklab, var(--primary) 28%, transparent)",
    boxShadow: "var(--shadow-soft)",
    color: "var(--primary)",
  };

  return (
    <m.div
      data-opening-gate
      /*
       * `overflow-y-auto` plus the `min-h-full` wrapper below, rather than
       * centring directly on this fixed element: a flex container that
       * centres content taller than itself overflows in BOTH directions and
       * the top half becomes unreachable, which is exactly what a phone
       * held sideways produced — 614px of card in 390px of screen, clipped
       * at the seal and at the button. The short-viewport rule in
       * globals.css shrinks the composition so this rarely has to engage;
       * this is the part that guarantees nothing is ever unreachable.
       */
      className="fixed inset-0 z-30 overflow-y-auto overscroll-contain"
      style={backdropStyle}
      initial={{ opacity: 1 }}
      animate={{ opacity: tapped ? 0 : 1 }}
      transition={{ duration: t(FADE_DURATION), delay: t(FADE_DELAY) }}
      onAnimationComplete={handleAnimationComplete}
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-8">
      <button
        type="button"
        onClick={handleTap}
        disabled={tapped}
        aria-label="Mở thiệp"
        className="flex w-full max-w-[22rem] cursor-pointer flex-col items-center gap-9 rounded-[1rem] transition-transform focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[var(--primary)] active:scale-[0.985] min-[700px]:max-w-[26rem]"
      >
        <m.span
          className="relative block w-full overflow-hidden pb-12"
          style={{
            ...cardStyle,
            perspective: 1400,
            /*
             * The first line of type has to clear the seal, not just the
             * flap — the seal hangs half its own height below the flap's
             * point. Computed rather than hardcoded so the short- and
             * wide-viewport rules in globals.css can resize the envelope
             * by changing `--envelope-flap`/`--envelope-seal` alone.
             */
            paddingTop: "calc(var(--envelope-flap) + var(--envelope-seal) / 2 + 1.75rem)",
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: tapped ? -28 : 0, opacity: tapped ? 0 : 1 }}
          transition={{ duration: t(CARD_DURATION), delay: t(CARD_DELAY) }}
        >
          {/* Paper grain. Purely optical — it is what stops a full-width
              flat gradient on a modern phone screen reading as plastic. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 block"
            style={{ backgroundImage: "var(--grain)", opacity: 0.035 }}
          />

          <m.span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 block origin-top"
            style={{ ...flapStyle, height: "var(--envelope-flap)" }}
            animate={{ rotateX: tapped ? 180 : 0 }}
            transition={{ duration: t(FLAP_DURATION) }}
          />

          {/* The seal sits at the flap's point but is NOT a child of it:
              parented to the flap it would rotate with it and spend half
              the animation showing the couple's initials mirrored. */}
          <m.span
            className="absolute left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{
              ...sealStyle,
              top: "var(--envelope-flap)",
              width: "var(--envelope-seal)",
              height: "var(--envelope-seal)",
            }}
            animate={{ opacity: tapped ? 0 : 1, scale: tapped ? 0.86 : 1 }}
            transition={{ duration: t(FLAP_DURATION * 0.6) }}
          >
            {/* The "tap me" cue. One slow ring, behind the seal, stopped
                dead by `prefers-reduced-motion` in globals.css. */}
            <span
              aria-hidden="true"
              className="hpwd-halo pointer-events-none absolute inset-0 block rounded-full"
              style={{ border: "1px solid color-mix(in oklab, var(--primary) 45%, transparent)" }}
            />
            {sigil ? (
              <span
                /* `whitespace-nowrap`: the seal shrinks to 2.5rem on a
                   short viewport, and without this "K & H" broke onto two
                   lines inside a 40px circle. */
                className="block whitespace-nowrap text-center"
                style={{
                  fontFamily: "var(--font-heading, inherit)",
                  fontSize: "var(--text-caption)",
                  letterSpacing: "0.04em",
                }}
              >
                {sigil}
              </span>
            ) : (
              /* No monogram and no cover section to take initials from.
                 A small lozenge keeps the seal from being an empty
                 circle, which reads as a missing image. */
              <span
                aria-hidden="true"
                className="block h-2 w-2 rotate-45"
                style={{ backgroundColor: "color-mix(in oklab, var(--primary) 70%, transparent)" }}
              />
            )}
          </m.span>

          <OpeningCaption
            opening={opening}
            guestName={guestName}
            identity={identity}
            tone="ink"
            className="relative px-7"
          />
        </m.span>

        <m.span
          className="block"
          animate={{ opacity: tapped ? 0 : 1 }}
          transition={{ duration: t(FLAP_DURATION * 0.5) }}
        >
          <OpeningCta tone="ink" />
        </m.span>
      </button>
      </div>
    </m.div>
  );
}
