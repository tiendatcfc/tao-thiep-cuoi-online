"use client";

import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ListField } from "../fields/ListField";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";

type DressCodeColor = { value: string };

/**
 * `colors` is a `string[]` in the schema but `ListField` works on objects,
 * so the panel wraps each entry on the way in and unwraps on the way out.
 * Keeping the schema a plain array of strings is worth the two `map`s: it
 * is what the section renders and what a future template would author.
 */
export function DressCodePanel({ section }: { section: Extract<Section, { type: "dresscode" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { title, note, colors } = section.props;

  function patch(next: Partial<typeof section.props>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Tiêu đề" value={title} onChange={(v) => patch({ title: v })} />
      <TextAreaField
        label="Ghi chú"
        value={note}
        onChange={(v) => patch({ note: v })}
        hint="Ví dụ: Trang phục dự tiệc, ưu tiên các tông màu bên dưới"
      />
      <ListField<DressCodeColor>
        label="Bảng màu"
        items={colors.map((value) => ({ value }))}
        onChange={(next) => patch({ colors: next.map((entry) => entry.value) })}
        createItem={() => ({ value: "#A62B45" })}
        renderItem={(item, _index, update) => (
          <div className="flex items-center gap-3">
            {/*
             * A real colour input plus the text, side by side. The text
             * field is the one that matters: a couple who has a hex from
             * their florist or their invitation designer types it, and the
             * picker is for everyone else.
             */}
            <input
              type="color"
              aria-label="Chọn màu"
              value={/^#[0-9a-fA-F]{6}$/.test(item.value) ? item.value : "#ffffff"}
              onChange={(event) => update({ value: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-1"
            />
            <TextField label="Mã màu" value={item.value} onChange={(v) => update({ value: v })} />
          </div>
        )}
      />
    </div>
  );
}
