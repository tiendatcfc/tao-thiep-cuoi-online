import Image from "next/image";
import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

function PersonCard({ person }: { person: Extract<Section, { type: "couple" }>["props"]["bride"] }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {person.photo ? (
        /*
         * A 128x128 circle. Uploads are stored at up to 1600px wide, so a
         * bare `<img>` here downloaded a full-resolution wedding photo to
         * fill a thumbnail roughly a hundredth of its area — twice per
         * invitation, once for each person. See CoverSection for why `fill`
         * rather than explicit dimensions.
         */
        <div className="relative h-32 w-32">
          <Image
            src={person.photo}
            alt={person.name}
            fill
            sizes="128px"
            className="rounded-full object-cover shadow"
          />
        </div>
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
