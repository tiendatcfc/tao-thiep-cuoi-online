"use client";

import { TIMELINE_ICONS, type Section, type TimelineIcon } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ListField } from "../fields/ListField";
import { TextField } from "../fields/TextField";

type TimelineItem = Extract<Section, { type: "timeline" }>["props"]["items"][number];

/** The picker's labels. Vietnamese, and describing the MOMENT rather than the drawing — a couple is choosing "cắt bánh", not "a cake outline". */
const ICON_LABELS: Record<TimelineIcon, string> = {
  none: "Không có",
  rings: "Nghi thức / trao nhẫn",
  camera: "Chụp ảnh",
  cake: "Cắt bánh",
  toast: "Nâng ly",
  car: "Rước dâu",
  flower: "Trang trí / tung hoa",
  music: "Văn nghệ",
};

export function TimelinePanel({ section }: { section: Extract<Section, { type: "timeline" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { title, items } = section.props;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Tiêu đề"
        value={title}
        onChange={(v) => updateSectionProps(section.id, { title: v })}
      />
      <ListField<TimelineItem>
        label="Các mốc thời gian"
        items={items}
        onChange={(next) => updateSectionProps(section.id, { items: next })}
        createItem={() => ({ time: "", label: "", icon: "none" })}
        itemLabel={(item) => [item.time, item.label].filter(Boolean).join(" · ") || "Mốc mới"}
        renderItem={(item, _index, update) => (
          <div className="flex flex-col gap-3">
            <TextField
              label="Giờ"
              value={item.time}
              onChange={(v) => update({ ...item, time: v })}
              hint="Ví dụ 17:30"
            />
            <TextField label="Nội dung" value={item.label} onChange={(v) => update({ ...item, label: v })} />
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span className="font-medium">Biểu tượng</span>
              <select
                value={item.icon}
                onChange={(event) => update({ ...item, icon: event.target.value as TimelineIcon })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {TIMELINE_ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {ICON_LABELS[icon]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      />
    </div>
  );
}
