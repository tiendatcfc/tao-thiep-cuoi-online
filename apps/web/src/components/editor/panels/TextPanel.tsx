"use client";

import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { RichTextEditor } from "../RichTextEditor";

export function TextPanel({ section }: { section: Extract<Section, { type: "text" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);

  return (
    <div className="flex flex-col gap-4">
      <RichTextEditor
        // `EditorPanel` renders `<Panel section={section} />` with no key,
        // so React reuses this component instance when the couple switches
        // between two *text* sections. TipTap reads `content` once, at
        // creation — without this key the second section would open
        // showing the first one's text, and the first keystroke would
        // overwrite it. Keyed by id, each section gets its own editor.
        key={section.id}
        label="Nội dung"
        value={section.props.html}
        onChange={(html) => updateSectionProps(section.id, { html })}
        hint="Chọn chữ rồi bấm nút định dạng. Dán từ Word/Google Docs cũng được — phần định dạng không hỗ trợ sẽ tự bỏ."
      />
    </div>
  );
}
