import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processImage } from "../image";

async function makeSolidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe("processImage", () => {
  it("resizes a large source into the standard widths without upscaling", async () => {
    const source = await makeSolidPng(1200, 800);

    const result = await processImage(source);

    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    // 1600 is dropped because it would exceed the 1200px source width.
    expect(result.variants.map((v) => v.width)).toEqual([400, 800]);

    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.width).toBe(variant.width);
      expect(meta.format).toBe("webp");
    }

    expect(result.blurDataUrl.startsWith("data:image/")).toBe(true);
    expect(result.blurDataUrl).toContain(";base64,");
  });

  it("never upscales past the source width, deduping to a single variant for small images", async () => {
    const source = await makeSolidPng(300, 200);

    const result = await processImage(source);

    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    // None of [400, 800, 1600] fit under 300px, so it dedupes to one
    // variant at the original width instead of three identical upscales.
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].width).toBe(300);

    const meta = await sharp(result.variants[0].buffer).metadata();
    expect(meta.width).toBe(300);
    expect(meta.format).toBe("webp");

    expect(result.blurDataUrl.startsWith("data:image/")).toBe(true);
  });

  it("auto-orients an EXIF orientation-6 photo: returns rotated (portrait) dims and produces portrait pixel output", async () => {
    // A landscape 1200x800 source tagged with EXIF Orientation=6 ("rotate
    // 90° CW to display correctly") is exactly what a phone camera held in
    // portrait mode writes: landscape sensor pixels + a tag saying "this is
    // actually portrait". Real phone JPEGs (not this synthetic fixture) are
    // what regressed without auto-orientation — see processImage's docblock.
    const landscape = sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 100, b: 50 } },
    });
    const source = await landscape.jpeg().withMetadata({ orientation: 6 }).toBuffer();

    // Sanity: confirm the fixture itself carries what we think it does
    // before trusting any assertion below.
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.width).toBe(1200);
    expect(sourceMeta.height).toBe(800);
    expect(sourceMeta.orientation).toBe(6);

    const result = await processImage(source);

    // The photo is semantically portrait (800 wide x 1200 tall) once EXIF
    // orientation is applied — these are the dims that must reach
    // AlbumImage.width/height for the masonry tiles and lightbox to size
    // correctly.
    expect(result.width).toBe(800);
    expect(result.height).toBe(1200);

    // TARGET_WIDTHS = [400, 800, 1600]; against an 800px-wide oriented
    // source, 1600 is dropped (would upscale) and 400/800 remain.
    expect(result.variants.map((v) => v.width)).toEqual([400, 800]);

    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.width).toBe(variant.width);
      // Actual output pixels are portrait (taller than wide) — not the
      // landscape shape the un-rotated source bytes have.
      expect(meta.height).toBeGreaterThan(meta.width);
      expect(meta.format).toBe("webp");
    }
    // The 800-wide variant is the full oriented height (1200), confirming
    // no accidental double-rotation or double-scaling.
    const fullWidthVariant = result.variants.find((v) => v.width === 800);
    const fullMeta = await sharp(fullWidthVariant!.buffer).metadata();
    expect(fullMeta.height).toBe(1200);

    // The blur placeholder flows through the same pipeline — it must be
    // portrait too, or the low-res placeholder flashes sideways before the
    // real (correctly oriented) image loads in.
    const blurBase64 = result.blurDataUrl.split(",")[1];
    const blurMeta = await sharp(Buffer.from(blurBase64, "base64")).metadata();
    expect(blurMeta.height).toBeGreaterThan(blurMeta.width);
  });

  it("leaves an unoriented image's dims unchanged (no EXIF orientation tag present)", async () => {
    // Guards against a regression where switching to `metadata().autoOrient`
    // for width/height accidentally changes behavior for the overwhelming
    // majority of uploads, which carry no orientation tag at all.
    const source = await makeSolidPng(1200, 800);

    const result = await processImage(source);

    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
  });
});
