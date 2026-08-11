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

/**
 * One component per `SectionType`, each typed to the exact props shape for
 * its own section — a typo pairing e.g. `couple` with `EventsSection` is a
 * compile error. `video` renders `null` (Phase 2); `wishes`/`form` are
 * placeholder shells until Tasks 10–11 land (`album`/`gift` are real as of
 * Task 9).
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
function renderSection(section: Section) {
  const Component = registry[section.type] as ComponentType<{ section: Section }>;
  return (
    <AnimatedSection key={section.id} animation={section.animation}>
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
