import type { Section } from "@hpwd/schema";
import { RICH_TEXT_CONTENT_CLASS } from "@/lib/rich-text-styles";
import { sanitizeHtml } from "@/lib/sanitize";
import { SectionWrapper } from "./SectionWrapper";

export function TextSection({ section }: { section: Extract<Section, { type: "text" }> }) {
  const html = sanitizeHtml(section.props.html);

  return (
    <SectionWrapper section={section} className="text-sm leading-relaxed text-gray-700">
      {/* html has passed through sanitizeHtml above. The shared class is
          the same one RichTextEditor applies to its editing surface, so
          what the couple builds is what their guests see — Tailwind's
          preflight would otherwise render every list without markers. */}
      <div className={RICH_TEXT_CONTENT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
    </SectionWrapper>
  );
}
