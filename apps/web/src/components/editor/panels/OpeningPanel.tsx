"use client";

import type { Opening } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { SelectField } from "../fields/SelectField";
import { TextField } from "../fields/TextField";
import { ToggleField } from "../fields/ToggleField";

const EFFECT_OPTIONS: { value: Opening["effect"]; label: string; icon: string }[] = [
  { value: "envelope", label: "Phong bì", icon: "✉️" },
  { value: "curtain", label: "Rèm kéo", icon: "🎭" },
  { value: "fade", label: "Mờ dần", icon: "✨" },
  { value: "none", label: "Không có", icon: "🚫" },
];

const PARTICLES_OPTIONS = [
  { value: "petals", label: "Cánh hoa" },
  { value: "confetti", label: "Kim tuyến" },
  { value: "none", label: "Không" },
];

function EffectPicker({ value, onChange }: { value: Opening["effect"]; onChange: (v: Opening["effect"]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">Hiệu ứng mở màn</span>
      <div role="radiogroup" aria-label="Hiệu ứng mở màn" className="grid grid-cols-2 gap-2">
        {EFFECT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
              value === option.value ? "border-rose-400 bg-rose-50" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="text-2xl" aria-hidden="true">
              {option.icon}
            </span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Document-level "Hiệu ứng mở màn" tab: opening animation, particle overlay, monogram, and whether the guest's name shows during the open. */
export function OpeningPanel() {
  const opening = useEditorStore((state) => state.document.opening);
  const updateOpening = useEditorStore((state) => state.updateOpening);

  return (
    <div className="flex flex-col gap-4">
      <EffectPicker value={opening.effect} onChange={(v) => updateOpening({ effect: v })} />
      <SelectField
        label="Hiệu ứng hạt"
        value={opening.particles ?? "none"}
        onChange={(v) => updateOpening({ particles: v === "none" ? null : (v as Opening["particles"]) })}
        options={PARTICLES_OPTIONS}
      />
      <TextField
        label="Monogram"
        value={opening.monogram}
        maxLength={4}
        onChange={(v) => updateOpening({ monogram: v })}
        hint="Chữ viết tắt hiển thị trên phong bì/rèm, tối đa 4 ký tự — ví dụ: M & H"
      />
      <ToggleField
        label="Hiện tên khách mời"
        value={opening.showGuestName}
        onChange={(v) => updateOpening({ showGuestName: v })}
      />
    </div>
  );
}
