import type { Section } from "@hpwd/schema";
import { SectionWrapper } from "./SectionWrapper";

/**
 * The colours guests are asked to wear.
 *
 * Swatches, never names. "Đỏ mận" means a different colour to every
 * person reading it, and the whole point of a dress code is that the
 * photographs come out looking deliberate — so the section shows the
 * actual colour and says nothing about it.
 *
 * Each swatch carries the value as its `title`, which is the one place a
 * literal hex is useful: a guest shopping for an outfit can read it off
 * and match it exactly.
 *
 * Renders nothing with no colours configured.
 */
export function DressCodeSection({ section }: { section: Extract<Section, { type: "dresscode" }> }) {
  const { title, note, colors } = section.props;
  if (colors.length === 0) return null;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4 text-center">
      {title ? (
        <h2 className="uppercase text-[var(--primary)]" style={{ fontSize: "var(--text-title)" }}>
          {title}
        </h2>
      ) : null}
      {note ? (
        <p className="max-w-[30ch] text-[var(--ink-soft)]" style={{ fontSize: "var(--text-body)" }}>
          {note}
        </p>
      ) : null}

      <ul className="mt-1 flex flex-wrap items-center justify-center gap-3.5">
        {colors.map((color, index) => (
          <li key={`${color}-${index}`}>
            {/*
             * A ring of the paper colour between the swatch and its border
             * so that a swatch the same shade as the page still reads as an
             * object — a white dress code on cream paper is a real case and
             * without this it simply disappears.
             */}
            <span
              title={color}
              className="block h-11 w-11 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow:
                  "0 0 0 3px var(--background), 0 0 0 4px color-mix(in oklab, var(--primary) 22%, transparent), var(--shadow-soft)",
              }}
            />
            <span className="sr-only">{color}</span>
          </li>
        ))}
      </ul>
    </SectionWrapper>
  );
}
