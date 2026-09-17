import { createAudioQueue, type AudioJobData, type AudioQueue } from "@hpwd/worker";

/**
 * Producer side of the audio transcoding queue.
 *
 * The queue name, job payload shape and retry policy all come from
 * `@hpwd/worker` rather than being restated here — see that module for why a
 * second copy of the name is the one bug this arrangement exists to prevent.
 * Importing `@hpwd/worker` pulls in the CONTRACT only: its package `main`
 * points at `queues.ts`, never at the worker bootstrap.
 */

/**
 * Module-level singleton with the same hot-reload guard as `@hpwd/db`'s prisma
 * client and `rate-limit.ts`'s redis client: Next re-evaluates modules on every
 * edit in dev, and a fresh BullMQ queue per evaluation would leak a Redis
 * connection each time until the server runs out.
 */
const globalForQueue = globalThis as unknown as { audioQueue?: AudioQueue };

function getAudioQueue(): AudioQueue {
  if (!globalForQueue.audioQueue) {
    globalForQueue.audioQueue = createAudioQueue({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      // Bounded, unlike a worker's blocking connection: this runs inside a
      // request handler, so a dead Redis has to surface as an error in a
      // couple of seconds rather than holding the request open.
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
  }
  return globalForQueue.audioQueue;
}

/**
 * Hands one audio file to the worker and returns the BullMQ job id.
 *
 * DELIBERATELY NOT FAIL-OPEN. `rateLimit` swallows Redis errors and allows the
 * request, because a dead Redis must never stop a guest submitting an RSVP on
 * the wedding day. The opposite is true here: if the job is not queued, no
 * worker will ever transcode the upload, so pretending it succeeded would
 * leave the couple watching a file that stays "processing" forever with
 * nothing to retry. The caller is expected to mark the asset failed and show a
 * Vietnamese error.
 */
export async function enqueueAudioJob(data: AudioJobData): Promise<string> {
  const job = await getAudioQueue().add("transcode", data);
  if (!job.id) {
    // BullMQ assigns the id; no id means the add did not land in Redis, and
    // returning an empty string would give the caller nothing to poll on.
    throw new Error("Không tạo được job xử lý nhạc (BullMQ không trả về job id).");
  }
  return job.id;
}

/** Drops the cached queue and closes its connections — used by tests, and so `vitest run` exits instead of hanging on a live socket. */
export async function disconnectAudioQueue(): Promise<void> {
  const queue = globalForQueue.audioQueue;
  globalForQueue.audioQueue = undefined;
  await queue?.close();
}
