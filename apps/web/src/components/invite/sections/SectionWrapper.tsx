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
  const base = fullBleed ? "w-full" : "mx-auto w-full max-w-[430px] px-6 py-14";
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
