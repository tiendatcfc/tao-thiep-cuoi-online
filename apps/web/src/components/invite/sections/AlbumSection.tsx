import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

/**
 * Placeholder shell — Task 9 fills this in with the actual grid/masonry/
 * carousel gallery. Kept here (rather than omitted) so `visible: true`
 * album sections still occupy their `data-section`/`order` slot in the
 * page and the registry stays total over `SectionType`.
 */
export function AlbumSection({ section }: { section: Extract<Section, { type: "album" }> }) {
  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Album ảnh</h2>
      <div className="w-full rounded-xl border border-dashed border-[var(--secondary)] py-12 text-center text-sm text-gray-400">
        Sắp ra mắt
      </div>
    </SectionWrapper>
  );
}
