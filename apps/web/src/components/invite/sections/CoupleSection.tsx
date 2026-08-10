import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

function PersonCard({ person }: { person: Extract<Section, { type: "couple" }>["props"]["bride"] }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {person.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- editor-uploaded URL
        <img src={person.photo} alt={person.name} className="h-32 w-32 rounded-full object-cover shadow" />
      ) : (
        <div className="h-32 w-32 rounded-full bg-[var(--secondary)]" aria-hidden />
      )}
      {person.name ? <p className="text-lg font-semibold text-[var(--primary)]">{person.name}</p> : null}
      {person.parents ? <p className="text-sm text-gray-600">{person.parents}</p> : null}
      {person.intro ? <p className="text-sm text-gray-500">{person.intro}</p> : null}
    </div>
  );
}

export function CoupleSection({ section }: { section: Extract<Section, { type: "couple" }> }) {
  const { bride, groom } = section.props;

  return (
    <SectionWrapper section={section} className="flex flex-col gap-10">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Cô dâu &amp; Chú rể</h2>
      <div className="flex flex-col gap-10">
        <PersonCard person={bride} />
        <PersonCard person={groom} />
      </div>
    </SectionWrapper>
  );
}
