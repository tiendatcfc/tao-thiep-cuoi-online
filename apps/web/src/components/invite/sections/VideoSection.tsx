import type { Section } from "@hpwd/schema";

/** Phase 2 (per the phase-0/1 brief) — renders nothing for now. */
export function VideoSection(props: { section: Extract<Section, { type: "video" }> }) {
  void props;
  return null;
}
