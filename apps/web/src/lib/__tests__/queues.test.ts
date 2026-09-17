import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AUDIO_QUEUE_NAME } from "@hpwd/worker";

import { disconnectAudioQueue, enqueueAudioJob } from "../queues";

/**
 * Real Redis, no mocking — same reasoning as the worker's own queue test: the
 * only thing that can go wrong here is the producer writing somewhere the
 * consumer is not reading, and a mock cannot see that.
 *
 * Everything runs under a throwaway `BULLMQ_PREFIX`. `pnpm dev` (turbo) now
 * starts a real worker alongside the web app, so without an isolated prefix
 * that worker consumes these jobs the instant they are added, and any
 * assertion about queue state races a live consumer. It also means the suite
 * never touches queued work belonging to the running dev environment.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const testPrefix = `test-web-${randomUUID().slice(0, 8)}`;
const previousPrefix = process.env.BULLMQ_PREFIX;

function jobKey(jobId: string): string {
  return `${testPrefix}:${AUDIO_QUEUE_NAME}:${jobId}`;
}

let probe: Redis;

beforeAll(() => {
  // Set before the first enqueue: the queue is a singleton and reads the
  // prefix when it is constructed.
  process.env.BULLMQ_PREFIX = testPrefix;
  process.env.REDIS_URL = REDIS_URL;
  probe = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
});

afterEach(async () => {
  process.env.REDIS_URL = REDIS_URL;
  process.env.BULLMQ_PREFIX = testPrefix;
  await disconnectAudioQueue();
});

afterAll(async () => {
  const keys = await probe.keys(`${testPrefix}*`);
  if (keys.length > 0) await probe.del(...keys);
  await probe.quit();
  if (previousPrefix === undefined) delete process.env.BULLMQ_PREFIX;
  else process.env.BULLMQ_PREFIX = previousPrefix;
});

describe("enqueueAudioJob", () => {
  it("writes the job into the queue the worker actually reads", async () => {
    const data = {
      assetId: `asset-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      sourceKey: "u/user-1/original.mp3",
    };

    const jobId = await enqueueAudioJob(data);

    expect(jobId).toBeTruthy();
    // Read back through raw Redis rather than bullmq's own API: this asserts
    // the bytes really landed under the prefix + queue name the worker
    // subscribes to, instead of round-tripping through the same library that
    // wrote them.
    const stored = await probe.hgetall(jobKey(jobId));
    expect(JSON.parse(stored.data)).toEqual(data);
  }, 20_000);

  it("queues the job as pending work a worker will pick up", async () => {
    const jobId = await enqueueAudioJob({
      assetId: `asset-${randomUUID()}`,
      userId: "user-1",
      sourceKey: "u/user-1/a.mp3",
    });

    const waiting = await probe.lrange(`${testPrefix}:${AUDIO_QUEUE_NAME}:wait`, 0, -1);
    expect(waiting).toContain(jobId);
  }, 20_000);

  it("carries the shared retry policy instead of a one-shot attempt", async () => {
    const jobId = await enqueueAudioJob({
      assetId: `asset-${randomUUID()}`,
      userId: "user-1",
      sourceKey: "u/user-1/a.mp3",
    });

    const stored = await probe.hgetall(jobKey(jobId));
    expect(JSON.parse(stored.opts).attempts).toBeGreaterThan(1);
  }, 20_000);

  it("THROWS when Redis is unreachable — it must not fail open like the rate limiter", async () => {
    // Deliberate contrast with `rateLimit`, which returns true on a dead
    // Redis so a guest can still submit an RSVP. Here, swallowing the error
    // would tell the couple their music uploaded successfully while nothing
    // will ever transcode it: the file would sit at "processing" forever.
    await disconnectAudioQueue();
    // Port 1 is reserved and nothing listens on it, so the connection is
    // refused immediately rather than hanging until a timeout.
    process.env.REDIS_URL = "redis://127.0.0.1:1";

    await expect(
      enqueueAudioJob({ assetId: "a", userId: "u", sourceKey: "k" }),
    ).rejects.toThrow();
  }, 20_000);

  it("reuses one queue across calls instead of opening a connection per upload", async () => {
    const before = (await probe.info("clients")).match(/connected_clients:(\d+)/)?.[1];

    await enqueueAudioJob({ assetId: "a1", userId: "u", sourceKey: "k" });
    await enqueueAudioJob({ assetId: "a2", userId: "u", sourceKey: "k" });

    const after = (await probe.info("clients")).match(/connected_clients:(\d+)/)?.[1];
    // A per-call queue would add at least one client per enqueue; a singleton
    // adds a fixed handful once and then nothing.
    expect(Number(after) - Number(before)).toBeLessThan(4);
  }, 20_000);
});
