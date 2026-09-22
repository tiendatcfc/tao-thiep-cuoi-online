import type { Opening } from "@hpwd/schema";

/**
 * The couple's names and wedding date, lifted from the document's cover
 * section by `InvitePage` and handed to the opening gate.
 *
 * It does NOT live on `OpeningSchema`: that would duplicate three fields
 * the cover section already owns, and a couple editing their names on the
 * cover would then watch the opening screen keep the old ones. The gate
 * reads the same source the invitation itself renders from.
 *
 * `null` wherever the document has no cover section at all — a legal, if
 * unusual, document, and the shape the editor's preview is in before the
 * couple has added one. Every consumer treats it as optional content.
 */
export interface OpeningIdentity {
  groomName: string;
  brideName: string;
  /** ISO date string, straight from `CoverProps.date`; `""` when unset. */
  date: string;
}

/**
 * Shared prop shape for the opening-effect variants (`EnvelopeOpening`,
 * `CurtainOpening`, `FadeOpening`, `RevealOpening`, `PetalsOpening`).
 * `onOpen` is the callback each variant invokes once its own tap-to-open
 * animation has finished playing — not on the raw click itself — so
 * `OpeningGate` only reveals the invitation once the effect has actually
 * completed.
 *
 * `onTap` (C1 fix, optional) fires synchronously on the raw click itself,
 * inside `useOpeningTap`'s `handleTap` — see that hook's own docstring.
 * `OpeningGate` uses it to start music playback within the same
 * user-gesture call stack, which strict WebKit (iOS) requires.
 */
export interface OpeningVariantProps {
  opening: Opening;
  guestName: string | null;
  /** Optional so the many existing call sites and tests that predate it still typecheck; every variant degrades to monogram-only when it is absent. */
  identity?: OpeningIdentity | null;
  onOpen: () => void;
  onTap?: () => void;
}
