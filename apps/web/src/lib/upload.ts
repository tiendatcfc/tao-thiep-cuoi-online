import { randomUUID } from "crypto";
import { prisma } from "@hpwd/db";
import { processImage } from "./image";
import { putObject } from "./storage";

export interface ProcessAndStoreImageParams {
  userId: string;
  buffer: Buffer;
  sourceContentType: string;
}

export interface ProcessAndStoreImageResult {
  url: string;
  width: number;
  height: number;
  blurDataUrl: string;
  assetId: string;
}

/**
 * Thrown when `processImage` (sharp) fails to decode the given buffer at
 * all — i.e. the bytes aren't a real image, whatever their declared
 * Content-Type said. Kept distinct from every other failure in this
 * pipeline (a storage/S3 error, a DB error) so the route can tell a client
 * mistake (400) apart from a server-side one (500) without string-matching
 * error messages.
 */
export class ImageDecodeError extends Error {
  constructor(cause: unknown) {
    super("Failed to decode image buffer");
    this.name = "ImageDecodeError";
    this.cause = cause;
  }
}

/**
 * The server-side image pipeline: decode+resize via processImage (which
 * doubles as the magic-byte check — a non-image buffer throws before
 * anything is written), upload every WebP variant, then record ONE
 * MediaAsset row. Storage writes happen before the DB row for the same
 * reason the old presign code ordered env validation first: a failure must
 * never leave a MediaAsset row pointing at objects that don't exist.
 *
 * `width`/`height` are the SOURCE dimensions; the canonical `url` is the
 * largest generated variant. Every variant shares the source aspect ratio,
 * which is all next/image needs them for.
 */
export async function processAndStoreImage(params: ProcessAndStoreImageParams): Promise<ProcessAndStoreImageResult> {
  const { userId, buffer, sourceContentType } = params;

  let result;
  try {
    result = await processImage(buffer);
  } catch (err) {
    throw new ImageDecodeError(err);
  }
  const { variants, blurDataUrl, width, height } = result;

  const assetId = randomUUID();

  // `variants` is ascending by width (processImage filters TARGET_WIDTHS =
  // [400, 800, 1600] in order), so the last upload is the largest — but a
  // storage failure partway through must not create a MediaAsset row
  // pointing at objects that were never written, hence uploading everything
  // first and creating the DB row only once every PutObject has succeeded.
  const uploaded: { width: number; url: string }[] = [];
  for (const variant of variants) {
    const url = await putObject(`u/${userId}/${assetId}-${variant.width}.webp`, variant.buffer, "image/webp");
    uploaded.push({ width: variant.width, url });
  }
  const canonical = uploaded[uploaded.length - 1];

  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      userId,
      kind: "image",
      url: canonical.url,
      // `status` defaults to "pending" for the audio pipeline, where the
      // row is written before the worker has transcoded anything. An image
      // has no such second stage: by the time this runs, every variant is
      // already in storage and `url` already works. Saying "ready" keeps
      // the column honest and keeps images out of the operations runbook's
      // stuck-asset query (docs/operations.md, section 6).
      status: "ready",
      meta: {
        contentType: "image/webp",
        sourceContentType,
        sourceSizeBytes: buffer.byteLength,
        width,
        height,
        blurDataUrl,
        variants: uploaded,
      },
    },
  });

  return { url: canonical.url, width, height, blurDataUrl, assetId };
}
