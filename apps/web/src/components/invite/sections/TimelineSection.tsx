import type { Section } from "@hpwd/schema";
import { InfoCard } from "../decor/InfoCard";
import { TimelineIcon } from "../decor/TimelineIcon";
import { SectionWrapper } from "./SectionWrapper";

/**
 * The running order of the wedding day.
 *
 * On a Vietnamese invitation this is the section guests actually plan
 * around — it is the difference between arriving for the ceremony and
 * arriving for the meal. It sits on a filled `InfoCard` for the same
 * reason the ceremony details do: the page needs somewhere dark to break
 * up a long scroll of centred type.
 *
 * Renders nothing when the couple has added no entries, same as
 * `AlbumSection` with no photos — an empty heading is worse than no
 * section.
 */
export function TimelineSection({ section }: { section: Extract<Section, { type: "timeline" }> }) {
  const { title, items } = section.props;
  if (items.length === 0) return null;

  return (
    <SectionWrapper section={section}>
      <InfoCard ornaments={["bottom-right"]}>
        {title ? (
          <h2 style={{ fontSize: "var(--text-title)" }}>{title}</h2>
        ) : null}

        <ol className="relative flex w-full flex-col gap-6 py-1">
          {/* The spine. Drawn behind the markers and inset to their centre,
              and stopped short at both ends so it reads as a thread between
              the entries rather than as a border on the card. */}
          <span
            aria-hidden="true"
            className="absolute bottom-3 left-[4.75rem] top-3 w-px"
            style={{ backgroundColor: "color-mix(in oklab, currentColor 28%, transparent)" }}
          />
          {items.map((item, index) => (
            // Entries have no stable id in the schema (whole-list replace
            // from the editor); index is safe here for the same reason as
            // StorySection.
            <li key={index} className="relative flex items-center gap-4 text-left">
              <span
                className="w-14 shrink-0 text-right tabular-nums"
                style={{ fontSize: "var(--text-lead)" }}
              >
                {item.time}
              </span>
              <span
                aria-hidden="true"
                className="relative z-10 flex h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: "var(--on-primary)",
                  boxShadow: "0 0 0 4px var(--primary)",
                }}
              />
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <TimelineIcon name={item.icon} />
                <span className="min-w-0" style={{ fontSize: "var(--text-body)" }}>
                  {item.label}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </InfoCard>
    </SectionWrapper>
  );
}
