import type { Opening } from "@hpwd/schema";

/**
 * Shared prop shape for the three opening-effect variants
 * (`EnvelopeOpening`, `CurtainOpening`, `FadeOpening`). `onOpen` is the
 * callback each variant invokes once its own tap-to-open animation has
 * finished playing — not on the raw click itself — so `OpeningGate` only
 * reveals the invitation and arms the music player once the effect has
 * actually completed.
 */
export interface OpeningVariantProps {
  opening: Opening;
  guestName: string | null;
  onOpen: () => void;
}
