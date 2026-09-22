import type { Section } from "@hpwd/schema";
import { ArchPortrait, givenInitial } from "../decor/ArchPortrait";
import { Ornament } from "../decor/Ornament";
import { SectionWrapper } from "./SectionWrapper";

type Person = Extract<Section, { type: "couple" }>["props"]["bride"];

/**
 * One half of the couple: the arch portrait, the name, then who they are —
 * parents first, because on a Vietnamese wedding invitation the families
 * are announcing the marriage, not only the couple.
 *
 * The portrait is the same `ArchPortrait` the cover uses, one size down
 * and without the floral sprays: at 176px the sprays would reach into the
 * name underneath, and the section already carries its own ornament.
 */
function PersonCard({ person, label }: { person: Person; label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <ArchPortrait
        src={person.photo}
        alt={person.name || label}
        fallbackText={givenInitial(person.name)}
        width={176}
      />
      <div className="flex flex-col items-center gap-1.5">
        <p
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
        >
          {/* "Trưởng nam" / "Út nữ" when the family gave one, otherwise
              just which of the two this is. A Vietnamese invitation states
              birth order under the name, because it is how the families
              identify which of their children is marrying. */}
          {person.role || label}
        </p>
        {person.name ? (
          <h3 className="text-[var(--primary)]" style={{ fontSize: "var(--text-title)" }}>
            {person.name}
          </h3>
        ) : null}
        {person.parents ? (
          <p className="max-w-[28ch] text-[var(--ink-soft)]" style={{ fontSize: "var(--text-body)" }}>
            {person.parents}
          </p>
        ) : null}
        {person.parentsCity ? (
          <p className="text-[var(--ink-faint)]" style={{ fontSize: "var(--text-caption)" }}>
            {person.parentsCity}
          </p>
        ) : null}
        {person.intro ? (
          <p className="max-w-[30ch] text-[var(--ink-faint)]" style={{ fontSize: "var(--text-caption)" }}>
            {person.intro}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A hairline with a lozenge, the same divider the cover uses under the date. */
function Divider() {
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-3">
      <span className="h-px w-10 bg-[var(--hairline)]" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[var(--secondary)]" />
      <span className="h-px w-10 bg-[var(--hairline)]" />
    </span>
  );
}

export function CoupleSection({ section }: { section: Extract<Section, { type: "couple" }> }) {
  const { bride, groom } = section.props;

  return (
    <SectionWrapper section={section} className="relative flex flex-col gap-9">
      {/* One spray for the whole section rather than one per portrait: the
          section is already two arches tall, and decorating both would
          make it the busiest thing on the page. */}
      {/* Sits INSIDE the section's top edge, not hanging above it: the
          section's own top is where the previous block ends, so a spray
          with a negative top margin gets sliced by nothing and simply
          reads as detached. */}
      <Ornament corner="top-right" size={108} opacity={0.72} className="-mr-5 mt-6" />

      <header className="flex flex-col items-center gap-2 text-center">
        <p
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
        >
          Chúng tôi sắp về chung một nhà
        </p>
        <h2 className="text-[var(--primary)]" style={{ fontSize: "var(--text-title)" }}>
          Cô dâu &amp; Chú rể
        </h2>
      </header>

      <PersonCard person={bride} label="Cô dâu" />
      <Divider />
      <PersonCard person={groom} label="Chú rể" />
    </SectionWrapper>
  );
}
