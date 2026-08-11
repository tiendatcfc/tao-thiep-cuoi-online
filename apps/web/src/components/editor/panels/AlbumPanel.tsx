"use client";

import type { AlbumProps, Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ImageField, TRANSPARENT_PIXEL_DATA_URL } from "../fields/ImageField";
import { ListField } from "../fields/ListField";
import { NumberField } from "../fields/NumberField";
import { SelectField } from "../fields/SelectField";

type AlbumImage = AlbumProps["images"][number];

const LAYOUT_OPTIONS = [
  { value: "grid", label: "Lưới" },
  { value: "masonry", label: "Xếp tầng" },
  { value: "carousel", label: "Băng chuyền" },
];

/**
 * `AlbumImageSchema.width`/`height` are required, positive integers, and
 * `blurDataUrl` is a required (if placeholder-able) string — a freshly
 * added item has none of that yet, so `createItem` seeds all three with
 * schema-valid placeholders (1×1, transparent pixel) rather than leaving
 * them unset; the couple then uploads a real photo via `ImageField`,
 * whose `onUploaded` overwrites all three with the real values at once.
 */
function createPlaceholderImage(): AlbumImage {
  return { url: "", width: 1, height: 1, blurDataUrl: TRANSPARENT_PIXEL_DATA_URL };
}

/**
 * `AlbumImageSchema.width`/`height` are `.int().positive()` — applied both
 * to manual `NumberField` edits and to `ImageField`'s `onUploaded` result.
 * `ImageField` itself already rejects a decode that reports `0×0` (see its
 * `readImageDimensions`), so this is defense-in-depth rather than the only
 * guard: a `0`/negative/fractional value should never be reachable here,
 * but if it ever were, this still can't produce a document that fails
 * schema validation.
 */
export function clampPositiveInt(n: number): number {
  return Math.max(1, Math.round(n));
}

export function AlbumPanel({ section }: { section: Extract<Section, { type: "album" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { layout, images } = section.props;

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label="Bố cục"
        value={layout}
        onChange={(v) => updateSectionProps(section.id, { layout: v as AlbumProps["layout"] })}
        options={LAYOUT_OPTIONS}
      />
      <ListField<AlbumImage>
        label="Ảnh trong album"
        items={images}
        onChange={(next) => updateSectionProps(section.id, { images: next })}
        createItem={createPlaceholderImage}
        itemLabel={(_item, i) => `Ảnh ${i + 1}`}
        emptyMessage="Chưa có ảnh nào trong album."
        renderItem={(image, _index, update) => (
          <div className="flex flex-col gap-2">
            <ImageField
              label="Ảnh"
              value={image.url}
              onChange={(url) => update({ ...image, url })}
              onUploaded={({ url, width, height }) =>
                update({
                  url,
                  width: clampPositiveInt(width),
                  height: clampPositiveInt(height),
                  blurDataUrl: TRANSPARENT_PIXEL_DATA_URL,
                })
              }
            />
            <div className="flex gap-2">
              <NumberField
                label="Rộng (px)"
                value={image.width}
                min={1}
                onChange={(v) => update({ ...image, width: clampPositiveInt(v) })}
              />
              <NumberField
                label="Cao (px)"
                value={image.height}
                min={1}
                onChange={(v) => update({ ...image, height: clampPositiveInt(v) })}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}
