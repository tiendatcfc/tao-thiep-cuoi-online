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
        // C9: mirrors TextPropsSchema.html's new `.max(10_000)` — without
        // this, typing past the limit would make the whole document fail
        // client-side validation and silently stop autosaving, the exact
        // same class of bug as B1's "+ Thêm" buttons.
        maxLength={10_000}
        onChange={(v) => updateSectionProps(section.id, { html: v })}
        hint="Hỗ trợ các thẻ: <p>, <strong>, <em>, <u>, <span>, <br>, <a href=&quot;…&quot;>. Các thẻ khác sẽ bị loại bỏ khi hiển thị."
      />
    </div>
  );
}
