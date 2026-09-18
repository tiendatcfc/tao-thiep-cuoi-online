import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "bullmq";
import { prisma } from "@hpwd/db";

import type { BgRemovalJobData } from "./queues";
import { downloadToFile, uploadFile } from "./storage";

/** Key the cut-out is written to. Suffixed rather than replacing the source, so the original photo is always still there to undo back to. */
export function backgroundRemovalOutputKey(userId: string, assetId: string): string {
  return `u/${userId}/${assetId}-nobg.png`;
}

/** PNG, not WebP: the point of the job is the alpha channel, and PNG is what the service returns. */
const OUTPUT_CONTENT_TYPE = "image/png";

/**
 * Ceiling for one inference request, mirroring `ffmpeg.ts`'s `TIMEOUT_MS`.
 * Without it a wedged model server would hold a BullMQ slot open forever and
 * the couple would watch "Đang xoá nền…" until the editor's own poll
 * deadline gave up, with the job still occupying the worker.
 */
const REQUEST_TIMEOUT_MS = 120_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rembgUrl(): string {
  return process.env.REMBG_URL ?? "http://127.0.0.1:7000";
}

/**
 * Turns one uploaded photo into a transparent-background PNG.
 *
 * Download the source → POST the bytes to `services/rembg` → upload the
 * result → point the target `MediaAsset` at it. The row is the only thing
 * the editor polls, so every exit path has to leave it in a state the UI can
 * act on: "ready" with a URL, or "failed" with a reason.
 *
 * The bytes are POSTed rather than a URL being handed over: the service must
 * never be able to fetch anything itself, or it becomes an SSRF primitive
 * reachable through the public upload flow.
 *
 * The SOURCE asset is never modified or deleted. A cut-out is a new asset
 * beside the original, because "xoá nền" is a destructive-looking operation
 * on a wedding photo and the couple has to be able to go back.
 */
export async function processBgRemovalJob(job: Job<BgRemovalJobData>): Promise<void> {
  const { targetAssetId, userId, sourceKey } = job.data;
  // One directory per job, removed in `finally` — fixed filenames would have
  // concurrent jobs overwrite each other's input.
  const workDir = await mkdtemp(join(tmpdir(), "hpwd-nobg-"));
  const inputPath = join(workDir, "source");
  const outputPath = join(workDir, "output.png");

  try {
    await downloadToFile(sourceKey, inputPath);
    const source = await readFile(inputPath);

    const form = new FormData();
    form.append("file", new Blob([source]), "source");

    const response = await fetch(`${rembgUrl()}/remove-background`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // The service's own detail is worth carrying: "not a decodable image"
      // and "image has too many pixels" are the two a human can act on.
      const detail = await response.text().catch(() => "");
      throw new Error(`rembg service returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }

    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    const url = await uploadFile(backgroundRemovalOutputKey(userId, targetAssetId), outputPath, OUTPUT_CONTENT_TYPE);

    // Read-then-merge rather than writing `meta` wholesale: a Prisma Json
    // update REPLACES the column, which would throw away `sourceAssetId`
    // and the dimensions the editor needs.
    const existing = await prisma.mediaAsset.findUnique({ where: { id: targetAssetId } });
    const meta = (existing?.meta ?? {}) as Record<string, unknown>;

    await prisma.mediaAsset.update({
      where: { id: targetAssetId },
      data: {
        status: "ready",
        url,
        meta: { ...meta, contentType: OUTPUT_CONTENT_TYPE, error: null },
      },
    });
  } catch (error) {
    // Only the LAST attempt may write "failed" — BullMQ retries, and the
    // editor stops polling the moment it sees "failed", so marking it on
    // attempt 1 would show a permanent error for a job still about to be
    // retried. Same rule as `audio-worker.ts`.
    const attemptsAllowed = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

    if (isFinalAttempt) {
      const existing = await prisma.mediaAsset.findUnique({ where: { id: targetAssetId } });
      const meta = (existing?.meta ?? {}) as Record<string, unknown>;
      await prisma.mediaAsset
        .update({
          where: { id: targetAssetId },
          data: { status: "failed", meta: { ...meta, error: errorMessage(error) } },
        })
        .catch((updateError) => {
          console.error(`[worker] could not mark asset ${targetAssetId} failed:`, updateError);
        });
    }

    // Rethrown so BullMQ records the failure and schedules the retry.
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
