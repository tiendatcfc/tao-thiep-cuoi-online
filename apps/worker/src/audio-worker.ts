import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "bullmq";
import { prisma } from "@hpwd/db";

import { transcodeToAac } from "./ffmpeg";
import type { AudioJobData } from "./queues";
import { downloadToFile, uploadFile } from "./storage";

/** Key the transcoded track is written to. Defined here because the worker is the only thing that writes it; apps/web reads the resulting URL from the database. */
export function audioOutputKey(userId: string, assetId: string): string {
  return `u/${userId}/${assetId}.m4a`;
}

/** Content type for an AAC track in an MP4 container — what browsers expect for `.m4a`. */
const OUTPUT_CONTENT_TYPE = "audio/mp4";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turns one uploaded file into a playable track.
 *
 * Download the source the web app stored → transcode with ffmpeg → upload the
 * result → point the MediaAsset row at it. The row is the only thing the
 * editor polls, so every exit path from here has to leave it in a state the
 * UI can act on: "ready" with a URL, or "failed" with a reason.
 */
export async function processAudioJob(job: Job<AudioJobData>): Promise<void> {
  const { assetId, userId, sourceKey } = job.data;
  // One directory per job, removed in `finally`: concurrency is 2, so fixed
  // filenames would have two jobs overwrite each other's input.
  const workDir = await mkdtemp(join(tmpdir(), "hpwd-audio-"));
  const inputPath = join(workDir, "source");
  const outputPath = join(workDir, "output.m4a");

  try {
    await downloadToFile(sourceKey, inputPath);
    const { durationSeconds } = await transcodeToAac(inputPath, outputPath);
    const url = await uploadFile(audioOutputKey(userId, assetId), outputPath, OUTPUT_CONTENT_TYPE);

    // Read-then-merge rather than writing `meta` wholesale: a Prisma Json
    // update REPLACES the column, and clobbering it would throw away
    // sourceKey/sourceContentType, which are what make a failure
    // investigable later.
    const existing = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    const meta = (existing?.meta ?? {}) as Record<string, unknown>;

    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: "ready",
        url,
        meta: { ...meta, durationSeconds, contentType: OUTPUT_CONTENT_TYPE, error: null },
      },
    });
  } catch (error) {
    // Only the LAST attempt is allowed to write "failed". BullMQ retries
    // this job, and the editor stops polling as soon as it sees "failed" —
    // marking it on attempt 1 would show "Xử lý thất bại" to the couple
    // while a retry that may well succeed is still pending, and they would
    // never see it turn ready.
    const attemptsAllowed = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

    if (isFinalAttempt) {
      const existing = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
      const meta = (existing?.meta ?? {}) as Record<string, unknown>;
      // Never let the bookkeeping failure mask the real one: if this update
      // throws (asset deleted mid-job, database blip), the original error is
      // still what gets rethrown below.
      await prisma.mediaAsset
        .update({
          where: { id: assetId },
          data: { status: "failed", meta: { ...meta, error: errorMessage(error) } },
        })
        .catch((updateError) => {
          console.error(`[worker] could not mark asset ${assetId} failed:`, updateError);
        });
    }

    // Rethrown so BullMQ records the failure and schedules the retry — a
    // swallowed error would be reported as a completed job.
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
