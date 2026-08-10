import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

/** Placeholder shell — Task 10 fills this in with VietQR codes per account. */
export function GiftSection({ section }: { section: Extract<Section, { type: "gift" }> }) {
  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Hộp mừng cưới</h2>
      <div className="w-full rounded-xl border border-dashed border-[var(--secondary)] py-12 text-center text-sm text-gray-400">
        Sắp ra mắt
      </div>
    </SectionWrapper>
  );
}
