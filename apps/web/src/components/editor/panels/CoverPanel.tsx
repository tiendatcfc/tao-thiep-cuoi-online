"use client";

import type { CoverProps, Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { DateField } from "../fields/DateField";
import { ImageField } from "../fields/ImageField";
import { TextField } from "../fields/TextField";

export function CoverPanel({ section }: { section: Extract<Section, { type: "cover" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { groomName, brideName, date, coverImage, tagline } = section.props;

  function patch(next: Partial<CoverProps>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Tên chú rể" value={groomName} onChange={(v) => patch({ groomName: v })} />
      <TextField label="Tên cô dâu" value={brideName} onChange={(v) => patch({ brideName: v })} />
      <DateField label="Ngày cưới" value={date} onChange={(v) => patch({ date: v })} />
      <ImageField label="Ảnh bìa" value={coverImage} onChange={(v) => patch({ coverImage: v })} />
      <TextField label="Khẩu hiệu" value={tagline} onChange={(v) => patch({ tagline: v })} />
    </div>
  );
}
