"use client";

import type { EventsProps, Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { DateField } from "../fields/DateField";
import { ListField } from "../fields/ListField";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";

type EventItem = EventsProps["items"][number];

export function EventsPanel({ section }: { section: Extract<Section, { type: "events" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { items } = section.props;

  return (
    <ListField<EventItem>
      label="Các sự kiện"
      items={items}
      onChange={(next) => updateSectionProps(section.id, { items: next })}
      createItem={() => ({ name: "", time: "", date: "", address: "", mapUrl: "" })}
      itemLabel={(item, i) => item.name || `Sự kiện ${i + 1}`}
      emptyMessage="Chưa có sự kiện nào."
      renderItem={(item, _index, update) => (
        <div className="flex flex-col gap-2">
          <TextField label="Tên sự kiện" value={item.name} onChange={(v) => update({ ...item, name: v })} />
          <DateField label="Ngày giờ" value={item.date} onChange={(v) => update({ ...item, date: v })} />
          <TextField
            label="Giờ hiển thị"
            value={item.time}
            onChange={(v) => update({ ...item, time: v })}
            placeholder="09:00"
            hint="Hiển thị trên thiệp cùng với ngày, ví dụ 09:00"
          />
          <TextAreaField label="Địa điểm" value={item.address} onChange={(v) => update({ ...item, address: v })} />
          <TextField label="Liên kết bản đồ" value={item.mapUrl} onChange={(v) => update({ ...item, mapUrl: v })} />
        </div>
      )}
    />
  );
}
