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
 *
 * EXIF orientation: a phone photo taken in portrait is stored with
 * landscape-oriented pixels plus an EXIF `Orientation` tag telling the
 * viewer to rotate it on display — browsers do this automatically, but
 * sharp does not unless told to. Every `sharp(buffer, ...)` pipeline below
 * is constructed with `{ autoOrient: true }` so the rotation is baked into
 * the actual output pixels (verified against the installed sharp 0.35.3's
 * `lib/index.d.ts`: `SharpOptions.autoOrient` — "Auto-orient based on the
 * EXIF Orientation tag, if present... Using this option will remove the
 * EXIF Orientation tag" — confirmed empirically too: constructing with
 * this option on an orientation-6-tagged source produces a buffer whose
 * OWN re-decoded metadata has swapped width/height and no orientation tag
 * left to double-apply downstream). The returned `width`/`height` are
 * read from `metadata().autoOrient` rather than the raw `metadata()`
 * fields — sharp's own docs mark plain `width`/`height` as "EXIF
 * orientation is not taken into consideration", while `.autoOrient` is
 * "changed metadata after the image orientation is applied", i.e. already
 * swapped for a 90°/270° rotation (orientations 5-8) — which is exactly
 * the dimensions the auto-oriented output buffers above end up with. This
 * field is populated unconditionally (confirmed empirically: present, and
 * equal to the raw width/height, even for a plain `sharp(buffer)` with no
 * constructor option and no orientation tag at all) so this is a no-op for
 * every existing, unoriented fixture.
 */
export async function processImage(buffer: Buffer): Promise<ProcessImageResult> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.autoOrient?.width ?? metadata.width;
  const height = metadata.autoOrient?.height ?? metadata.height;
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
      const resized = await sharp(buffer, { autoOrient: true })
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return { width: targetWidth, buffer: resized };
    })
  );

  const blurBuffer = await sharp(buffer, { autoOrient: true })
    .resize({ width: BLUR_PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: BLUR_PREVIEW_QUALITY })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString("base64")}`;

  return { variants, blurDataUrl, width, height };
}
