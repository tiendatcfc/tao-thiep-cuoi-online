import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendSpy, createSpy } = vi.hoisted(() => ({ sendSpy: vi.fn(), createSpy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = sendSpy;
    },
  };
});
vi.mock("@hpwd/db", () => ({ prisma: { mediaAsset: { create: createSpy } } }));

import { ImageDecodeError, processAndStoreImage } from "../upload";

beforeEach(() => {
  sendSpy.mockReset().mockResolvedValue({});
  createSpy.mockReset().mockResolvedValue({});
  process.env.R2_ENDPOINT = "http://localhost:9000";
  process.env.R2_ACCESS_KEY_ID = "k";
  process.env.R2_SECRET_ACCESS_KEY = "s";
  process.env.R2_BUCKET = "hpwd";
  process.env.R2_PUBLIC_URL = "http://localhost:9000/hpwd";
});

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 120 } } })
    .png()
    .toBuffer();
}

describe("processAndStoreImage", () => {
  it("uploads one object per variant and returns the largest as the canonical url", async () => {
    const result = await processAndStoreImage({ userId: "u1", buffer: await pngBuffer(1200, 800), sourceContentType: "image/png" });
    // 1200-wide source → variants 400 + 800 (processImage never upscales)
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(result.url).toMatch(/-800\.webp$/);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("records a MediaAsset row whose meta carries dimensions, blur and every variant url", async () => {
    await processAndStoreImage({ userId: "u1", buffer: await pngBuffer(1200, 800), sourceContentType: "image/png" });
    const data = createSpy.mock.calls[0][0].data;
    expect(data.kind).toBe("image");
    expect(data.meta.width).toBe(1200);
    expect(data.meta.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(data.meta.variants).toHaveLength(2);
  });

  it("records the image as ready, not pending — nothing processes it afterwards", async () => {
    // `MediaAsset.status` exists for the AUDIO pipeline, where a row is
    // written before the worker has transcoded anything. An image is
    // finished the moment this function returns: every variant is already
    // in storage and the url already works. Leaving it on the column's
    // `pending` default made every image ever uploaded match the
    // operations runbook's "stuck asset" query
    // (`status IN ('pending','processing')` older than ten minutes), which
    // is a false alarm an on-call reader has no way to tell from a real one.
    await processAndStoreImage({ userId: "u1", buffer: await pngBuffer(600, 400), sourceContentType: "image/png" });

    expect(createSpy.mock.calls[0][0].data.status).toBe("ready");
  });

  it("throws (and uploads nothing) for a buffer that is not an image", async () => {
    await expect(
      processAndStoreImage({ userId: "u1", buffer: Buffer.from("not an image"), sourceContentType: "image/png" }),
    ).rejects.toThrow();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("wraps a decode failure in ImageDecodeError so the route can tell it apart from a storage failure", async () => {
    await expect(
      processAndStoreImage({ userId: "u1", buffer: Buffer.from("not an image"), sourceContentType: "image/png" }),
    ).rejects.toBeInstanceOf(ImageDecodeError);
  });

  it("does not wrap a storage (S3) failure in ImageDecodeError", async () => {
    sendSpy.mockRejectedValueOnce(new Error("S3 is down"));
    const attempt = processAndStoreImage({ userId: "u1", buffer: await pngBuffer(1200, 800), sourceContentType: "image/png" });
    await expect(attempt).rejects.toThrow("S3 is down");
    await expect(attempt.catch((err) => err)).resolves.not.toBeInstanceOf(ImageDecodeError);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
