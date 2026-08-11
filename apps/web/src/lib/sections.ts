import type { Section } from "@hpwd/schema";

export type CoverSection = Extract<Section, { type: "cover" }>;

/**
 * Finds the (at most one) cover section in a document's section list.
 * Shared by everything that needs the couple's names/date/cover photo for
 * something other than the normal `SectionRenderer` flow: `PublishDialog`'s
 * slug suggestion, `generateMetadata`, and the OG image route.
 */
export function findCoverSection(sections: Section[]): CoverSection | null {
  return sections.find((section): section is CoverSection => section.type === "cover") ?? null;
}
