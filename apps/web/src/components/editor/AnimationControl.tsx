"use client";

import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { NumberField } from "./fields/NumberField";
import { SelectField } from "./fields/SelectField";

type Animation = Section["animation"];

const PRESET_OPTIONS: { value: Animation["preset"]; label: string }[] = [
  { value: "fade", label: "Mờ dần" },
  { value: "slide-up", label: "Trượt lên" },
  { value: "zoom", label: "Phóng to" },
  { value: "none", label: "Không có" },
];

const MIN_DURATION_MS = 100;
const MAX_DURATION_MS = 3000;

/**
 * Keeps durationMs inside AnimationSchema's bounds (`.int().min(100).max(3000)`)
 * — an out-of-range or fractional write would make the whole document fail
 * `InvitationDocumentSchema.parse` and silently kill autosave for the entire
 * invitation, not just this section (Global Constraint 2). `NumberField`
 * already guards against `NaN`/empty input (see its own docstring) and,
 * given `min`/`max` props, against out-of-range values too — this is the
 * same defense-in-depth pairing `AlbumPanel`'s `clampPositiveInt` uses
 * alongside `NumberField`'s `min` prop: it additionally rounds a fractional
 * value (which `NumberField`'s own min/max clamp does not do) and is the
 * sole guard for the non-finite fallback of 600 (the historical default),
 * which `NumberField` itself never lets through in practice.
 */
export function clampDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 600;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(value)));
}

/**
 * Exposes `Section["animation"]` — already fully implemented by
 * `AnimatedSection`/`SectionRenderer`, but never editable before this —
 * for every section type uniformly. Rendered once in `EditorPanel`,
 * beneath whichever type-specific panel is showing, rather than
 * duplicated across all ten panels.
 */
export function AnimationControl({ section }: { section: Section }) {
  const updateSectionAnimation = useEditorStore((state) => state.updateSectionAnimation);
  const { preset, durationMs } = section.animation;

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-gray-200 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hiệu ứng xuất hiện</h3>
      <SelectField
        label="Kiểu hiệu ứng"
        value={preset}
        onChange={(v) => updateSectionAnimation(section.id, { preset: v as Animation["preset"] })}
        options={PRESET_OPTIONS}
      />
      {preset !== "none" ? (
        <NumberField
          label="Thời lượng (ms)"
          value={durationMs}
          min={MIN_DURATION_MS}
          max={MAX_DURATION_MS}
          onChange={(v) => updateSectionAnimation(section.id, { durationMs: clampDurationMs(v) })}
        />
      ) : null}
    </div>
  );
}
