import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

/** Placeholder shell — Task 11 fills this in with the wish list + submit form. */
export function WishesSection({ section }: { section: Extract<Section, { type: "wishes" }> }) {
  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">{section.props.title}</h2>
      <div className="w-full rounded-xl border border-dashed border-[var(--secondary)] py-12 text-center text-sm text-gray-400">
        Sắp ra mắt
      </div>
    </SectionWrapper>
  );
}
