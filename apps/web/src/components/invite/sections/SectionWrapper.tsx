import type { CSSProperties, ReactNode } from "react";
import type { Section } from "@hpwd/schema";

/**
 * Shared `<section>` shell every section component renders: the
 * `data-section` / `data-section-id` pair the brief requires on every
 * section (used by tests and, later, by the editor's click-to-select-block
 * UI), plus mobile-first max-width column layout so individual sections
 * only need to describe their own content, not their outer chrome.
 */
export function SectionWrapper({
  section,
  className = "",
  fullBleed = false,
  style,
  children,
}: {
  section: Pick<Section, "type" | "id">;
  className?: string;
  /** Skip the default max-width/padding — the cover section fills the viewport. */
  fullBleed?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  /*
   * The gutter and the vertical rhythm come from `--gutter`/`--section-y`
   * in globals.css rather than from literal Tailwind steps, so the
   * breathing room of every section on every invitation is one value in
   * one file. It was `px-6 py-14`; `--section-y` is deliberately larger,
   * because the single biggest difference between a page that looks
   * designed and one that looks defaulted is how much air sits around the
   * type.
   */
  const base = fullBleed ? "w-full" : "mx-auto w-full max-w-[430px] px-[var(--gutter)] py-[var(--section-y)]";
  return (
    <section
      data-section={section.type}
      data-section-id={section.id}
      className={`${base} ${className}`.trim()}
      style={style}
    >
      {children}
    </section>
  );
}
