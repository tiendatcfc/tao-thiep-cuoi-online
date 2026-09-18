import { execFile, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Job } from "bullmq";
import { prisma } from "@hpwd/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { processAudioJob } from "../audio-worker";
import type { AudioJobData } from "../queues";
import { uploadFile } from "../storage";

const run = promisify(execFile);

/**
 * Real Postgres, real MinIO, real ffmpeg — the whole job, end to end. Mocking
 * any one of the three would leave the only thing this module does (move
 * bytes between two systems and record the result) untested.
 */
function hasBinary(name: string): boolean {
  const result = spawnSync(name, ["-version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

// Probed synchronously: `describe.skipIf` is evaluated while tests are
// collected, before any hook has run.
const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");

let userId: string;
let workDir: string;
const createdAssetIds: string[] = [];

/**
 * Builds a fake BullMQ job. Only the three fields the processor reads are
 * provided; constructing a real `Job` would require a live queue and add
 * nothing, since the queue round trip already has its own test.
 */
function fakeJob(data: AudioJobData, attemptsMade = 0, attempts = 3): Job<AudioJobData> {
  return { data, attemptsMade, opts: { attempts } } as Job<AudioJobData>;
}

async function makeMp3(path: string, seconds: number): Promise<void> {
  await run("ffmpeg", ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-y", path]);
}

async function seedAsset(sourceKey: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      userId,
      kind: "audio",
      url: "http://example.invalid/not-ready-yet",
      status: "processing",
      meta: { sourceKey, sourceContentType: "audio/mpeg" },
    },
  });
  createdAssetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `audio-worker-${randomUUID()}@test.local`, name: "Audio Worker Test" },
  });
  userId = user.id;
  workDir = await mkdtemp(join(tmpdir(), "hpwd-audio-worker-test-"));
});

afterAll(async () => {
  if (createdAssetIds.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe.skipIf(!ffmpegAvailable)("processAudioJob (real storage + ffmpeg + database)", () => {
  it("transcodes the uploaded file and publishes a playable track", async () => {
    const localMp3 = join(workDir, "input.mp3");
    await makeMp3(localMp3, 2);
    const sourceKey = `u/${userId}/${randomUUID()}-source.mp3`;
    await uploadFile(sourceKey, localMp3, "audio/mpeg");
    const assetId = await seedAsset(sourceKey);

    await processAudioJob(fakeJob({ assetId, userId, sourceKey }));

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset?.status).toBe("ready");
    expect(asset?.url).toMatch(/\.m4a$/);

    const meta = asset?.meta as Record<string, unknown>;
    expect(meta.durationSeconds).toBeGreaterThan(1.7);
    expect(meta.durationSeconds).toBeLessThan(2.3);
    // sourceKey must survive the update: a Prisma Json write replaces the
    // whole column, so losing it here would make a later failure unreadable.
    expect(meta.sourceKey).toBe(sourceKey);

    // Fetch the published URL the way a guest's browser would, and check the
    // container at the byte level rather than trusting our own return value.
    const response = await fetch(asset!.url);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(4, 8)).toString("latin1")).toBe("ftyp");
  }, 60_000);

  it("deletes the uploaded source once the track is playable", async () => {
    // The source stayed in the bucket forever, publicly readable, next to
    // the converted track. Nothing ever read it again after a successful
    // transcode: it was pure storage cost, and a copy of the couple's
    // original file — higher quality and carrying whatever ID3 metadata
    // their phone wrote — served to anyone who guessed the key. The privacy
    // policy only ever disclosed the CONVERTED track as public.
    const localMp3 = join(workDir, "cleanup.mp3");
    await makeMp3(localMp3, 1);
    const sourceKey = `u/${userId}/${randomUUID()}-source.mp3`;
    await uploadFile(sourceKey, localMp3, "audio/mpeg");
    const assetId = await seedAsset(sourceKey);

    await processAudioJob(fakeJob({ assetId, userId, sourceKey }));

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.status).toBe("ready");
    // The playable track is there...
    expect((await fetch(asset.url)).status).toBe(200);
    // ...and the original upload is gone.
    expect((await fetch(`${process.env.R2_PUBLIC_URL}/${sourceKey}`)).status).toBe(404);
  }, 60_000);

  it("keeps the source when the job fails, so a retry still has something to read", async () => {
    // Deleting on failure would turn one transient storage blip into a
    // permanently unrecoverable upload.
    const junk = join(workDir, "keep-on-failure.mp3");
    await writeFile(junk, "day khong phai file nhac");
    const sourceKey = `u/${userId}/${randomUUID()}-source.mp3`;
    await uploadFile(sourceKey, junk, "audio/mpeg");
    const assetId = await seedAsset(sourceKey);

    await expect(processAudioJob(fakeJob({ assetId, userId, sourceKey }, 0, 3))).rejects.toThrow();

    expect((await fetch(`${process.env.R2_PUBLIC_URL}/${sourceKey}`)).status).toBe(200);
  }, 60_000);

  it("marks the asset failed with a readable reason when the file is not audio", async () => {
    const junk = join(workDir, "junk.mp3");
    await writeFile(junk, "day khong phai file nhac");
    const sourceKey = `u/${userId}/${randomUUID()}-source.mp3`;
    await uploadFile(sourceKey, junk, "audio/mpeg");
    const assetId = await seedAsset(sourceKey);

    // Rethrown so BullMQ records the failure; a resolved promise would have
    // the job reported as completed. Driven as the FINAL attempt (3 of 3),
    // because only the last one is allowed to write "failed" — see the next
    // test for the other half of that rule.
    await expect(
      processAudioJob(fakeJob({ assetId, userId, sourceKey }, 2, 3)),
    ).rejects.toThrow();

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset?.status).toBe("failed");
    expect(String((asset?.meta as Record<string, unknown>).error)).toMatch(/ffmpeg/i);
  }, 60_000);

  it("leaves the status alone on a non-final attempt, so a retry can still succeed", async () => {
    // The editor stops polling the moment it sees "failed". Writing that on
    // attempt 1 of 3 would show the couple a permanent failure while a retry
    // that may well succeed is still pending.
    const junk = join(workDir, "junk2.mp3");
    await writeFile(junk, "khong phai nhac");
    const sourceKey = `u/${userId}/${randomUUID()}-source.mp3`;
    await uploadFile(sourceKey, junk, "audio/mpeg");
    const assetId = await seedAsset(sourceKey);

    await expect(
      processAudioJob(fakeJob({ assetId, userId, sourceKey }, 0, 3)),
    ).rejects.toThrow();

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset?.status).toBe("processing");
  }, 60_000);

  it("fails the job when the source object is missing entirely", async () => {
    const sourceKey = `u/${userId}/${randomUUID()}-does-not-exist.mp3`;
    const assetId = await seedAsset(sourceKey);

    await expect(
      processAudioJob(fakeJob({ assetId, userId, sourceKey }, 2, 3)),
    ).rejects.toThrow();

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset?.status).toBe("failed");
  }, 60_000);
});
