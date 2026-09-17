import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUDIO_JOB_OPTIONS,
  AUDIO_QUEUE_NAME,
  createAudioQueue,
  createAudioWorker,
  type AudioJobData,
} from "../queues";

/**
 * Drives a REAL Redis (the same one `docker compose -f docker-compose.dev.yml
 * up -d redis` starts, and the `redis:7` service in CI). The single thing this
 * module has to get right is that a producer in apps/web and a consumer in
 * apps/worker land on the same queue — a mocked bullmq would assert only that
 * we passed the constant we wrote, which is exactly the bug that cannot happen
 * anyway. Round-tripping a job through Redis is the only test that means
 * anything here.
 */
const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

// Every test runs under its own prefix so a `pnpm dev:worker` left running in
// another terminal cannot steal these jobs (which would hang the suite), and
// so the suite never touches real queued work.
const testPrefix = `test-${randomUUID().slice(0, 8)}`;

let probe: Redis;

beforeAll(async () => {
  probe = new Redis(connection.url, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
});

afterAll(async () => {
  const keys = await probe.keys(`${testPrefix}*`);
  if (keys.length > 0) await probe.del(...keys);
  await probe.quit();
});

describe("audio queue contract", () => {
  it("pins the queue name, because renaming it strands jobs already in Redis", () => {
    // A deployed worker reads a queue by name. Changing this string means a
    // new web release enqueues into a queue no running worker is watching,
    // and the jobs sit there unprocessed with nothing reporting an error.
    expect(AUDIO_QUEUE_NAME).toBe("audio-transcode");
  });

  it("retries a failing job rather than dropping it on the first error", () => {
    // ffmpeg work fails for transient reasons too (S3 blip, worker restart
    // mid-job). One attempt would turn those into permanent user-visible
    // failures.
    expect(AUDIO_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(AUDIO_JOB_OPTIONS.backoff).toMatchObject({ type: "exponential" });
  });

  it("does not keep every finished job in Redis forever", () => {
    // Left unbounded, completed job hashes grow without limit and quietly
    // become the largest thing in Redis on an instance that also holds rate
    // limit keys.
    expect(AUDIO_JOB_OPTIONS.removeOnComplete).toBeDefined();
    expect(AUDIO_JOB_OPTIONS.removeOnFail).toBeDefined();
  });

  it("delivers a job from the producer side to the consumer side unchanged", async () => {
    const queue = createAudioQueue(connection, { prefix: testPrefix });
    const data: AudioJobData = {
      assetId: `asset-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      sourceKey: "u/user-1/original.mp3",
    };

    let resolveReceived: (value: AudioJobData) => void;
    const received = new Promise<AudioJobData>((resolve) => {
      resolveReceived = resolve;
    });

    const worker = createAudioWorker(
      connection,
      async (job) => {
        resolveReceived(job.data);
      },
      { prefix: testPrefix },
    );

    try {
      await queue.add("transcode", data);
      await expect(received).resolves.toEqual(data);
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 20_000);

  it("reports a job that throws as failed instead of silently completing", async () => {
    const queue = createAudioQueue(connection, { prefix: testPrefix });
    let resolveFailed: (reason: string) => void;
    const failed = new Promise<string>((resolve) => {
      resolveFailed = resolve;
    });

    const worker = createAudioWorker(
      connection,
      async () => {
        throw new Error("ffmpeg failed: Invalid data found when processing input");
      },
      { prefix: testPrefix },
    );
    worker.on("failed", (_job, error) => resolveFailed(error.message));

    try {
      await queue.add(
        "transcode",
        { assetId: "a", userId: "u", sourceKey: "k" },
        // One attempt here so the assertion does not wait out the real
        // exponential backoff between retries.
        { attempts: 1 },
      );
      await expect(failed).resolves.toContain("ffmpeg failed");
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 20_000);

  it("keeps producer and consumer on the same prefix, or nothing is ever delivered", async () => {
    const queue = createAudioQueue(connection, { prefix: testPrefix });
    try {
      expect(queue.name).toBe(AUDIO_QUEUE_NAME);
      expect(queue.opts.prefix).toBe(testPrefix);
    } finally {
      await queue.close();
    }
  });
});
