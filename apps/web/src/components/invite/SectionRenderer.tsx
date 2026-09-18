import type { ComponentType } from "react";
import type { InvitationDocument, Section, SectionType } from "@hpwd/schema";
import { AlbumSection } from "./sections/AlbumSection";
import { CoupleSection } from "./sections/CoupleSection";
import { CoverSection } from "./sections/CoverSection";
import { EventsSection } from "./sections/EventsSection";
import { FormSection } from "./sections/FormSection";
import { GiftSection } from "./sections/GiftSection";
import { StorySection } from "./sections/StorySection";
import { TextSection } from "./sections/TextSection";
import { VideoSection } from "./sections/VideoSection";
import { WishesSection } from "./sections/WishesSection";
import { AnimatedSection } from "./AnimatedSection";

/** `preset: "none"` is the existing "render children as-is, no motion wrapper" path. */
const NO_ANIMATION: Section["animation"] = { preset: "none", durationMs: 0 };

/**
 * One component per `SectionType`, each typed to the exact props shape for
 * its own section — a typo pairing e.g. `couple` with `EventsSection` is a
 * compile error. All ten section types render real content.
 */
const registry: { [K in SectionType]: ComponentType<{ section: Extract<Section, { type: K }> }> } = {
  cover: CoverSection,
  couple: CoupleSection,
  story: StorySection,
  events: EventsSection,
  album: AlbumSection,
  video: VideoSection,
  gift: GiftSection,
  wishes: WishesSection,
  form: FormSection,
  text: TextSection,
};

/**
 * `registry[section.type]` is, at runtime, always the component matching
 * that exact `type` — but a plain indexed access loses the correlation
 * between the union member and its component's prop type, so TypeScript
 * only sees "some component in the registry" rather than "the matching
 * one". The cast re-asserts what's already guaranteed by construction.
 */
function renderSection(section: Section, index: number) {
  const Component = registry[section.type] as ComponentType<{ section: Section }>;
  // The first visible section is above the fold by definition, so animating
  // it INTO view is a contradiction — and an expensive one. framer-motion
  // writes the `initial` state (`opacity: 0`) straight into the
  // server-rendered HTML, so that section stays invisible until the bundle
  // has downloaded, parsed and hydrated. Measured on a production build at
  // Slow 4G with 4x CPU throttling: LCP 1,477 ms, of which 1,437 ms (97%)
  // was render delay waiting for exactly that, on text that had been in the
  // HTML since the first byte.
  //
  // Index, not `type === "cover"`: sections are reorderable and the cover can
  // be hidden, so keying off the type would leave whatever the couple
  // actually put first invisible until hydration.
  const animation = index === 0 ? NO_ANIMATION : section.animation;
  return (
    <AnimatedSection key={section.id} animation={animation}>
      <Component section={section} />
    </AnimatedSection>
  );
}

export function SectionRenderer({ document }: { document: InvitationDocument }) {
  const orderedVisibleSections = [...document.sections]
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order);

  return <>{orderedVisibleSections.map(renderSection)}</>;
}
