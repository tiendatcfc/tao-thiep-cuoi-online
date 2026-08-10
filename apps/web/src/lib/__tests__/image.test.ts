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
});
