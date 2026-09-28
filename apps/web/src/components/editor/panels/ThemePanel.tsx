"use client";

import { useState } from "react";
import { fontFamilyStack, FONT_OPTIONS } from "@/lib/fonts";
import { useEditorStore } from "@/stores/editor-store";
import { CustomFontStyle } from "../../invite/CustomFontStyle";
import { ColorField } from "../fields/ColorField";
import { FontUploadField, type UploadedFont } from "../fields/FontUploadField";
import { SelectField } from "../fields/SelectField";

const BUILT_IN_FONT_OPTIONS = FONT_OPTIONS.map((font) => ({ value: font.family, label: font.family }));

/**
 * Document-level "Giao diện" tab: theme colors, the font-pair picker, and
 * the couple's own uploaded fonts.
 *
 * Every change flows through `updateTheme`, so `PreviewPane` (which
 * subscribes to the whole `document`, `InvitePage` and all) reflects it
 * immediately — same live-preview wiring as every section panel, just at
 * the document level instead of a single section's props.
 */
export function ThemePanel() {
  const theme = useEditorStore((state) => state.document.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const [warning, setWarning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Uploaded families are offered alongside the built-in ones rather than
  // in a separate picker: to the couple they are simply more fonts, and a
  // second control would mean two places to look for the one they just
  // added.
  const fontOptions = [
    ...BUILT_IN_FONT_OPTIONS,
    ...theme.customFonts.map((font) => ({ value: font.family, label: `${font.family} (font riêng)` })),
  ];

  function handleUploaded(font: UploadedFont) {
    setWarning(
      font.missingGlyphs
        ? `Font "${font.family}" thiếu ${font.missingGlyphs.length} ký tự tiếng Việt (${font.missingGlyphs}). Những chữ đó sẽ hiển thị bằng font dự phòng.`
        : null,
    );
    // Replacing by family, not appending blindly: re-uploading the same
    // font would otherwise stack duplicate `@font-face` rules and duplicate
    // entries in the picker.
    const others = theme.customFonts.filter((existing) => existing.family !== font.family);
    updateTheme({
      customFonts: [...others, { family: font.family, url: font.url, assetId: font.assetId }],
    });
  }

  async function handleRemove(family: string, assetId: string) {
    setRemoving(family);
    setWarning(null);
    try {
      // Drop the stored object first. If it fails the font stays listed so
      // the couple can try again, rather than vanishing from the editor
      // while still occupying storage.
      if (assetId) {
        const response = await fetch(`/api/fonts/${assetId}`, { method: "DELETE" });
        if (!response.ok) {
          setWarning("Không xoá được font, vui lòng thử lại.");
          return;
        }
      }
      const remaining = theme.customFonts.filter((font) => font.family !== family);
      // A font still selected as the heading/body face would leave the
      // theme pointing at a family with no `@font-face` behind it, so the
      // selection falls back to the first built-in.
      const fallback = FONT_OPTIONS[0].family;
      updateTheme({
        customFonts: remaining,
        headingFont: theme.headingFont === family ? fallback : theme.headingFont,
        bodyFont: theme.bodyFont === family ? fallback : theme.bodyFont,
      });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The same rules the invitation gets, so the preview below actually
          renders in an uploaded font instead of silently falling back. */}
      <CustomFontStyle fonts={theme.customFonts} />

      <ColorField label="Màu chủ đạo" value={theme.primary} onChange={(v) => updateTheme({ primary: v })} />
      <ColorField label="Màu phụ" value={theme.secondary} onChange={(v) => updateTheme({ secondary: v })} />
      <ColorField label="Màu nền" value={theme.background} onChange={(v) => updateTheme({ background: v })} />

      <SelectField
        label="Font tiêu đề"
        value={theme.headingFont}
        onChange={(v) => updateTheme({ headingFont: v })}
        options={fontOptions}
      />
      <SelectField
        label="Font nội dung"
        value={theme.bodyFont}
        onChange={(v) => updateTheme({ bodyFont: v })}
        options={fontOptions}
      />

      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
        <span className="text-xs font-medium text-gray-500">Font riêng</span>
        {theme.customFonts.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {theme.customFonts.map((font) => (
              <li key={font.family} className="flex items-center justify-between gap-2 text-sm">
                <span style={{ fontFamily: fontFamilyStack(font.family) }}>{font.family}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(font.family, font.assetId)}
                  disabled={removing === font.family}
                  aria-label={`Xoá font ${font.family}`}
                  className="rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-red-600 disabled:opacity-60"
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <FontUploadField onUploaded={handleUploaded} />
        {warning ? (
          <span role="status" className="text-xs text-amber-600">
            {warning}
          </span>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-lg" style={{ fontFamily: fontFamilyStack(theme.headingFont) }}>
          Ngọc Hải &amp; Hồng Thắm
        </p>
        <p className="text-sm text-gray-600" style={{ fontFamily: fontFamilyStack(theme.bodyFont) }}>
          Trân trọng kính mời bạn đến chung vui cùng chúng tôi.
        </p>
      </div>
    </div>
  );
}
