"use client";

import { fontFamilyStack, FONT_OPTIONS } from "@/lib/fonts";
import { useEditorStore } from "@/stores/editor-store";
import { ColorField } from "../fields/ColorField";
import { SelectField } from "../fields/SelectField";

const FONT_SELECT_OPTIONS = FONT_OPTIONS.map((font) => ({ value: font.family, label: font.family }));

/**
 * Document-level "Giao diện" tab: theme colors + the font-pair picker.
 * Every change flows through `updateTheme`, so `PreviewPane` (which
 * subscribes to the whole `document`, `InvitePage` and all) reflects it
 * immediately — same live-preview wiring as every section panel, just at
 * the document level instead of a single section's props.
 */
export function ThemePanel() {
  const theme = useEditorStore((state) => state.document.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);

  return (
    <div className="flex flex-col gap-4">
      <ColorField label="Màu chủ đạo" value={theme.primary} onChange={(v) => updateTheme({ primary: v })} />
      <ColorField label="Màu phụ" value={theme.secondary} onChange={(v) => updateTheme({ secondary: v })} />
      <ColorField label="Màu nền" value={theme.background} onChange={(v) => updateTheme({ background: v })} />

      <SelectField
        label="Font tiêu đề"
        value={theme.headingFont}
        onChange={(v) => updateTheme({ headingFont: v })}
        options={FONT_SELECT_OPTIONS}
      />
      <SelectField
        label="Font nội dung"
        value={theme.bodyFont}
        onChange={(v) => updateTheme({ bodyFont: v })}
        options={FONT_SELECT_OPTIONS}
      />

      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-lg" style={{ fontFamily: fontFamilyStack(theme.headingFont) }}>
          Minh Khang &amp; Thu Hà
        </p>
        <p className="text-sm text-gray-600" style={{ fontFamily: fontFamilyStack(theme.bodyFont) }}>
          Trân trọng kính mời bạn đến chung vui cùng chúng tôi.
        </p>
      </div>
    </div>
  );
}
