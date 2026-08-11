"use client";

import type { Section, WishesProps } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";
import { ToggleField } from "../fields/ToggleField";

export function WishesPanel({ section }: { section: Extract<Section, { type: "wishes" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { title, description, requireApproval } = section.props;

  function patch(next: Partial<WishesProps>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Tiêu đề" value={title} onChange={(v) => patch({ title: v })} />
      <TextAreaField label="Mô tả" value={description} onChange={(v) => patch({ description: v })} />
      <ToggleField
        label="Duyệt lời chúc trước khi hiển thị"
        hint="Lời chúc mới sẽ chờ bạn duyệt trước khi hiện công khai trên thiệp."
        value={requireApproval}
        onChange={(v) => patch({ requireApproval: v })}
      />
    </div>
  );
}
