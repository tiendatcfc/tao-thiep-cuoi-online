import type { Opening } from "@hpwd/schema";

/**
 * Shared prop shape for the three opening-effect variants
 * (`EnvelopeOpening`, `CurtainOpening`, `FadeOpening`). `onOpen` is the
 * callback each variant invokes once its own tap-to-open animation has
 * finished playing — not on the raw click itself — so `OpeningGate` only
 * reveals the invitation once the effect has actually completed.
 *
 * `onTap` (C1 fix, optional) fires synchronously on the raw click itself,
 * inside `useOpeningTap`'s `handleTap` — see that hook's own docstring.
 * `OpeningGate` uses it to start music playback within the same
 * user-gesture call stack, which strict WebKit (iOS) requires.
 */
export interface OpeningVariantProps {
  opening: Opening;
  guestName: string | null;
  onOpen: () => void;
  onTap?: () => void;
}
