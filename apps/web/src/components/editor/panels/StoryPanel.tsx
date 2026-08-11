"use client";

import type { Section, StoryProps } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ImageField } from "../fields/ImageField";
import { ListField } from "../fields/ListField";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";

type StoryItem = StoryProps["items"][number];

export function StoryPanel({ section }: { section: Extract<Section, { type: "story" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { items } = section.props;

  return (
    <ListField<StoryItem>
      label="Các mốc thời gian"
      items={items}
      onChange={(next) => updateSectionProps(section.id, { items: next })}
      createItem={() => ({ date: "", title: "", text: "", image: "" })}
      itemLabel={(item, i) => item.title || `Mốc ${i + 1}`}
      emptyMessage="Chưa có mốc thời gian nào."
      renderItem={(item, _index, update) => (
        <div className="flex flex-col gap-2">
          <TextField label="Thời điểm" value={item.date} onChange={(v) => update({ ...item, date: v })} placeholder="Tháng 6, 2023" />
          <TextField label="Tiêu đề" value={item.title} onChange={(v) => update({ ...item, title: v })} />
          <TextAreaField label="Nội dung" value={item.text} onChange={(v) => update({ ...item, text: v })} />
          <ImageField label="Ảnh" value={item.image} onChange={(v) => update({ ...item, image: v })} />
        </div>
      )}
    />
  );
}
