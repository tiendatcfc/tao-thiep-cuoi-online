import type { Section } from "@hpwd/schema";
import { sanitizeHtml } from "@/lib/sanitize";
import { SectionWrapper } from "./SectionWrapper";

export function TextSection({ section }: { section: Extract<Section, { type: "text" }> }) {
  const html = sanitizeHtml(section.props.html);

  return (
    <SectionWrapper section={section} className="text-sm leading-relaxed text-gray-700">
      {/* html has passed through sanitizeHtml above */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </SectionWrapper>
  );
}
