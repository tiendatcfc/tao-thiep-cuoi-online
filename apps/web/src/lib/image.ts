import sharp from "sharp";

/**
 * Target widths (px) for the resized WebP variants we generate for every
 * uploaded image. We never upscale past the source width — if the source is
 * smaller than a target, that target is dropped instead of producing a
 * duplicate, upscaled copy.
 */
const TARGET_WIDTHS = [400, 800, 1600] as const;

const WEBP_QUALITY = 80;
const BLUR_PREVIEW_WIDTH = 16;
const BLUR_PREVIEW_QUALITY = 40;

export interface ImageVariant {
  width: number;
  url?: string;
  buffer: Buffer;
}

export interface ProcessImageResult {
  variants: ImageVariant[];
  blurDataUrl: string;
  width: number;
  height: number;
}

/**
 * Pure image pipeline: takes an image buffer and returns resized WebP
 * variant buffers plus a base64 blur placeholder. Has no storage
 * side-effects — callers decide where (if anywhere) to persist the
 * returned buffers.
 */
export async function processImage(buffer: Buffer): Promise<ProcessImageResult> {
  const metadata = await sharp(buffer).metadata();
  const { width, height } = metadata;
  if (!width || !height) {
    throw new Error("Không đọc được kích thước ảnh.");
  }

  const widths: number[] = TARGET_WIDTHS.filter((target) => target <= width);
  // Source is smaller than every target width: dedupe down to a single
  // variant at the original width rather than emitting several identical,
  // non-upscaled copies.
  if (widths.length === 0) {
    widths.push(width);
  }

  const variants = await Promise.all(
    widths.map(async (targetWidth) => {
      const resized = await sharp(buffer)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return { width: targetWidth, buffer: resized };
    })
  );

  const blurBuffer = await sharp(buffer)
    .resize({ width: BLUR_PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: BLUR_PREVIEW_QUALITY })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString("base64")}`;

  return { variants, blurDataUrl, width, height };
}
