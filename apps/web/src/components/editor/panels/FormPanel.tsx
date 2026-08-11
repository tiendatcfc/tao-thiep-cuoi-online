"use client";

import type { FormField, FormProps, Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ListField } from "../fields/ListField";
import { SelectField } from "../fields/SelectField";
import { TextField } from "../fields/TextField";
import { ToggleField } from "../fields/ToggleField";

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Văn bản ngắn" },
  { value: "textarea", label: "Văn bản dài" },
  { value: "select", label: "Chọn 1 (danh sách xổ xuống)" },
  { value: "radio", label: "Chọn 1 (nhiều lựa chọn)" },
  { value: "checkbox", label: "Chọn nhiều" },
  { value: "number", label: "Số" },
  { value: "date", label: "Ngày" },
];

const TYPES_NEEDING_OPTIONS: ReadonlySet<FormField["type"]> = new Set(["select", "radio", "checkbox"]);

function FormFieldEditor({ field, onChange }: { field: FormField; onChange: (next: FormField) => void }) {
  const needsOptions = TYPES_NEEDING_OPTIONS.has(field.type);

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Nhãn câu hỏi"
        value={field.label}
        maxLength={200}
        onChange={(v) => onChange({ ...field, label: v })}
      />
      <SelectField
        label="Loại câu hỏi"
        value={field.type}
        onChange={(v) => onChange({ ...field, type: v as FormField["type"] })}
        options={FIELD_TYPE_OPTIONS}
      />
      <ToggleField label="Bắt buộc" value={field.required} onChange={(v) => onChange({ ...field, required: v })} />
      <TextField
        label="Placeholder (tuỳ chọn)"
        value={field.placeholder ?? ""}
        onChange={(v) => onChange({ ...field, placeholder: v })}
      />
      {needsOptions ? (
        <>
          <ListField<string>
            label="Lựa chọn"
            items={field.options}
            onChange={(options) => onChange({ ...field, options })}
            createItem={() => ""}
            itemLabel={(opt, i) => opt || `Lựa chọn ${i + 1}`}
            renderItem={(opt, _index, update) => (
              <TextField label="Nội dung lựa chọn" value={opt} onChange={update} />
            )}
          />
          {field.options.length === 0 ? (
            <p className="text-xs text-amber-600">
              Cần thêm ít nhất 1 lựa chọn để khách mời có thể chọn được.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Edits a `form` section's questions. `isRsvp` is not user-editable here —
 * it's system-managed (which form is the couple's canonical RSVP), shown
 * only as a read-only note so it's clear which form guests actually submit
 * through.
 */
export function FormPanel({ section }: { section: Extract<Section, { type: "form" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { title, fields, submitLabel, isRsvp } = section.props;

  function patch(next: Partial<FormProps>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      {isRsvp ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Đây là biểu mẫu xác nhận tham dự (RSVP) chính mà khách mời sẽ điền.
        </p>
      ) : null}
      <TextField label="Tiêu đề" value={title} onChange={(v) => patch({ title: v })} />
      <ListField<FormField>
        label="Câu hỏi trong biểu mẫu"
        items={fields}
        onChange={(next) => patch({ fields: next })}
        // `FormFieldSchema.label` is `.min(1)` — seeding `""` used to make
        // the freshly-added field fail `InvitationDocumentSchema.parse`
        // immediately, silently breaking autosave for the WHOLE document
        // (see `panels.schema-integration.test.tsx`). A placeholder label
        // the couple is expected to overwrite keeps the document valid the
        // instant "+ Thêm" is clicked.
        createItem={() => ({
          id: crypto.randomUUID(),
          type: "text",
          label: "Câu hỏi mới",
          required: false,
          options: [],
        })}
        itemLabel={(field, i) => field.label || `Câu hỏi ${i + 1}`}
        emptyMessage="Chưa có câu hỏi nào."
        renderItem={(field, _index, update) => <FormFieldEditor field={field} onChange={update} />}
      />
      <TextField label="Nút gửi" value={submitLabel} onChange={(v) => patch({ submitLabel: v })} />
    </div>
  );
}
