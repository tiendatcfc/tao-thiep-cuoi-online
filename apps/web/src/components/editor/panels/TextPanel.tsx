"use client";

import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { TextAreaField } from "../fields/TextAreaField";

/**
 * No rich-text editor here (Phase 2 / TipTap, per the task's YAGNI note) —
 * the couple edits `TextProps.html` as raw markup directly. `TextSection`
 * runs it through `sanitizeHtml` before rendering, so only a small
 * allowlist of tags actually has any effect either way.
 */
export function TextPanel({ section }: { section: Extract<Section, { type: "text" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);

  return (
    <div className="flex flex-col gap-4">
      <TextAreaField
        label="Nội dung"
        value={section.props.html}
        rows={8}
        onChange={(v) => updateSectionProps(section.id, { html: v })}
        hint="Hỗ trợ các thẻ: <p>, <strong>, <em>, <u>, <span>, <br>, <a href=&quot;…&quot;>. Các thẻ khác sẽ bị loại bỏ khi hiển thị."
      />
    </div>
  );
}
