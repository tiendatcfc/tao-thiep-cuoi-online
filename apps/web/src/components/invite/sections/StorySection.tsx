import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

export function StorySection({ section }: { section: Extract<Section, { type: "story" }> }) {
  const { items } = section.props;

  return (
    <SectionWrapper section={section} className="flex flex-col gap-8">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Chuyện tình yêu</h2>
      <ol className="flex flex-col gap-6 border-l-2 border-[var(--secondary)] pl-6">
        {items.map((item, index) => (
          // Timeline entries have no stable id in the schema; index is safe
          // here because this list is only ever fully replaced, never
          // reordered in place, by the editor (Task 15).
          <li key={index} className="flex flex-col gap-1">
            {item.date ? (
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--secondary)]">
                {item.date}
              </span>
            ) : null}
            {item.title ? <p className="text-base font-semibold text-gray-800">{item.title}</p> : null}
            {item.text ? <p className="text-sm text-gray-600">{item.text}</p> : null}
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- editor-uploaded URL
              <img src={item.image} alt={item.title} className="mt-2 h-40 w-full rounded-lg object-cover" />
            ) : null}
          </li>
        ))}
      </ol>
    </SectionWrapper>
  );
}
