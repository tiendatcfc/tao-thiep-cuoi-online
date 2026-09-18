import {
  createAudioQueue,
  createBgRemovalQueue,
  redisRetryStrategy,
  type AudioJobData,
  type AudioQueue,
  type BgRemovalJobData,
  type BgRemovalQueue,
} from "@hpwd/worker";

/**
 * Producer side of the background queues (audio transcoding, background
 * removal).
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
const globalForQueue = globalThis as unknown as { audioQueue?: AudioQueue; bgRemovalQueue?: BgRemovalQueue };

/**
 * How long an enqueue may take before the caller is told it failed.
 *
 * This is enforced by `addWithTimeout` below rather than by the connection
 * options, and that split is the whole point. `retryStrategy` used to give
 * up after three attempts, which did make a dead Redis surface quickly — by
 * killing the connection for good, so the process never recovered when
 * Redis came back (see `redisRetryStrategy` in @hpwd/worker for the outage
 * this caused). Reconnection now never gives up, and the request-level
 * deadline lives where it belongs: around the call.
 *
 * ioredis's own `commandTimeout` does not cover this case — a command
 * issued while the socket is down waits in the offline queue and the timer
 * never starts, which is exactly the "Redis is dead" case. It is still set
 * because it covers the other one: a command that WAS sent and never
 * answered.
 */
const ENQUEUE_TIMEOUT_MS = 5_000;

/**
 * Bounded, unlike a worker's blocking connection: this runs inside a request
 * handler, so a dead Redis has to surface as an error in a couple of seconds
 * rather than holding the request open.
 */
function connectionOptions() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    connectTimeout: 2000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 2,
    retryStrategy: redisRetryStrategy,
  };
}

/**
 * Rejects if the enqueue has not landed within `ENQUEUE_TIMEOUT_MS`.
 *
 * A timed-out `add` may still reach Redis afterwards, producing a job for
 * an asset the route has already marked failed. That is the better of the
 * two outcomes: the couple sees an error and can retry, and the stray job
 * writes a finished result over an asset nobody is waiting on. The
 * alternative — holding the request open on a dead Redis — gives them a
 * spinner that never resolves.
 */
async function addWithTimeout<T>(what: string, add: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      add,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${what}: Redis không phản hồi trong ${ENQUEUE_TIMEOUT_MS}ms.`)),
          ENQUEUE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    // Without this the pending timer keeps the event loop (and `vitest run`)
    // alive for the full timeout after a successful enqueue.
    if (timer) clearTimeout(timer);
  }
}

function getAudioQueue(): AudioQueue {
  if (!globalForQueue.audioQueue) {
    globalForQueue.audioQueue = createAudioQueue(connectionOptions());
  }
  return globalForQueue.audioQueue;
}

function getBgRemovalQueue(): BgRemovalQueue {
  if (!globalForQueue.bgRemovalQueue) {
    globalForQueue.bgRemovalQueue = createBgRemovalQueue(connectionOptions());
  }
  return globalForQueue.bgRemovalQueue;
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
  const job = await addWithTimeout("Xử lý nhạc", getAudioQueue().add("transcode", data));
  if (!job.id) {
    // BullMQ assigns the id; no id means the add did not land in Redis, and
    // returning an empty string would give the caller nothing to poll on.
    throw new Error("Không tạo được job xử lý nhạc (BullMQ không trả về job id).");
  }
  return job.id;
}

/**
 * Hands one photo to the background-removal worker and returns the job id.
 *
 * Not fail-open, for exactly the reason `enqueueAudioJob` is not: a job that
 * never reaches the queue is a cut-out no worker will ever produce, and the
 * editor would poll a status that can never change.
 */
export async function enqueueBgRemovalJob(data: BgRemovalJobData): Promise<string> {
  const job = await addWithTimeout(
    "Xoá nền",
    getBgRemovalQueue().add("remove-background", data),
  );
  if (!job.id) {
    throw new Error("Không tạo được job xoá nền (BullMQ không trả về job id).");
  }
  return job.id;
}

/** Drops the cached queues and closes their connections — used by tests, and so `vitest run` exits instead of hanging on a live socket. */
export async function disconnectAudioQueue(): Promise<void> {
  const queues = [globalForQueue.audioQueue, globalForQueue.bgRemovalQueue];
  globalForQueue.audioQueue = undefined;
  globalForQueue.bgRemovalQueue = undefined;
  await Promise.all(queues.map((queue) => queue?.close()));
}
