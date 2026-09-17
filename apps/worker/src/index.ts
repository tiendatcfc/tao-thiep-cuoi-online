import type { Job } from "bullmq";

import {
  AUDIO_QUEUE_NAME,
  AUDIO_WORKER_CONCURRENCY,
  audioQueuePrefix,
  createAudioWorker,
  type AudioJobData,
} from "./queues";

/**
 * Worker process entry point.
 *
 * Run with `pnpm dev:worker` (watch mode) or `pnpm --filter @hpwd/worker start`.
 *
 * IMPORTING THIS MODULE STARTS A WORKER. Nothing may import it as a library —
 * which is why `package.json` points `main` at `queues.ts` instead, so that
 * `import { ... } from "@hpwd/worker"` in apps/web gets the queue contract and
 * can never reach this file.
 *
 * DEPLOYMENT: the graceful shutdown below only runs if SIGTERM actually
 * reaches THIS Node process. Verified by hand: signalling the node process
 * runs the handler and exits cleanly, and `tsx` forwards a signal sent to its
 * own CLI wrapper — but a `pnpm start` wrapper in between does not reliably
 * pass one on. A container must therefore exec the worker directly
 * (`CMD ["npx", "tsx", "src/index.ts"]`, not `CMD ["pnpm", "start"]`), or an
 * in-flight transcode is SIGKILLed at the end of the grace period instead of
 * being allowed to finish.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * How long a graceful shutdown may take before the process is killed anyway.
 * `worker.close()` waits for in-flight jobs to finish; a wedged ffmpeg child
 * could otherwise hold the process open past whatever grace period the
 * supervisor (Docker, systemd, Fly) allows, and get SIGKILLed mid-write.
 */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Placeholder processor.
 *
 * Phase 2 Task 5 delivers the queue infrastructure only; Task 6 replaces this
 * with `processAudioJob` from `./audio-worker` (download from S3 →
 * transcodeToAac → upload → update MediaAsset).
 *
 * It THROWS rather than returning quietly on purpose: a handler that resolved
 * without doing anything would have BullMQ record the job as completed, while
 * the MediaAsset row it was supposed to finish stays at "processing" forever
 * — a stuck upload with nothing anywhere reporting an error.
 */
async function processAudioJob(job: Job<AudioJobData>): Promise<void> {
  throw new Error(
    `Audio transcoding is not implemented yet (Phase 2 Task 6). Job ${job.id} for asset ${job.data.assetId} was rejected rather than silently marked done.`,
  );
}

function main(): void {
  const worker = createAudioWorker(
    { url: REDIS_URL },
    async (job) => {
      const startedAt = Date.now();
      console.log(
        `[worker] job ${job.id} started queue=${AUDIO_QUEUE_NAME} asset=${job.data.assetId} attempt=${job.attemptsMade + 1}`,
      );
      try {
        await processAudioJob(job);
        console.log(`[worker] job ${job.id} finished in ${Date.now() - startedAt}ms`);
      } catch (error) {
        // Logged here with the job context, then rethrown: BullMQ needs the
        // rejection to schedule the retry and mark the job failed. Swallowing
        // it would turn every failure into a silent success.
        console.error(`[worker] job ${job.id} failed after ${Date.now() - startedAt}ms:`, error);
        throw error;
      }
    },
  );

  // Without an "error" listener, ioredis/BullMQ emit an unhandled "error"
  // event on a Redis blip, which takes the whole process down. The worker
  // should ride out a brief outage and reconnect instead.
  worker.on("error", (error) => {
    console.error("[worker] redis/queue error:", error);
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id ?? "?"} marked failed:`, error.message);
  });

  console.log(
    `[worker] listening on queue "${AUDIO_QUEUE_NAME}" prefix=${audioQueuePrefix()} concurrency=${AUDIO_WORKER_CONCURRENCY} redis=${REDIS_URL}`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    // A second Ctrl-C (or a supervisor sending SIGTERM twice) must not start
    // a second close and reject the first one's promise.
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received, finishing in-flight jobs…`);

    const forceExit = setTimeout(() => {
      console.error(`[worker] shutdown exceeded ${SHUTDOWN_TIMEOUT_MS / 1000}s, exiting anyway`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Don't let the timer itself be the reason the event loop stays alive.
    forceExit.unref();

    try {
      await worker.close();
      clearTimeout(forceExit);
      console.log("[worker] shut down cleanly");
      process.exit(0);
    } catch (error) {
      console.error("[worker] error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main();
