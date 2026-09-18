import type { Job, Processor, Worker } from "bullmq";
import { processAudioJob } from "./audio-worker";
import { startHeartbeat } from "./heartbeat";
import { processBgRemovalJob } from "./background-removal-worker";
import type { AudioJobData, BgRemovalJobData } from "./queues";
import {
  AUDIO_QUEUE_NAME,
  AUDIO_WORKER_CONCURRENCY,
  BG_REMOVAL_QUEUE_NAME,
  BG_REMOVAL_WORKER_CONCURRENCY,
  createAudioWorker,
  createBgRemovalWorker,
  queuePrefix,
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
 * Wraps a processor with the per-job logging every queue wants, so the two
 * workers cannot drift into reporting differently.
 *
 * The error is logged here with its job context and then rethrown: BullMQ
 * needs the rejection to schedule the retry and mark the job failed, and a
 * swallowed one would be recorded as a completed job.
 */
function withLogging<T>(
  queueName: string,
  describe: (data: T) => string,
  run: (job: Job<T>) => Promise<void>,
): Processor<T> {
  return async (job) => {
    const startedAt = Date.now();
    console.log(
      `[worker] job ${job.id} started queue=${queueName} ${describe(job.data)} attempt=${job.attemptsMade + 1}`,
    );
    try {
      await run(job);
      console.log(`[worker] job ${job.id} finished in ${Date.now() - startedAt}ms`);
    } catch (error) {
      console.error(`[worker] job ${job.id} failed after ${Date.now() - startedAt}ms:`, error);
      throw error;
    }
  };
}

function main(): void {
  // Started before the workers: if Redis is reachable at all, the process
  // should be visible as alive from the moment it boots, not only once it
  // has successfully attached to both queues.
  const heartbeat = startHeartbeat(REDIS_URL);

  const workers: Worker[] = [
    createAudioWorker(
      { url: REDIS_URL },
      withLogging<AudioJobData>(AUDIO_QUEUE_NAME, (data) => `asset=${data.assetId}`, processAudioJob),
    ),
    createBgRemovalWorker(
      { url: REDIS_URL },
      withLogging<BgRemovalJobData>(
        BG_REMOVAL_QUEUE_NAME,
        (data) => `asset=${data.targetAssetId}`,
        processBgRemovalJob,
      ),
    ),
  ];

  for (const worker of workers) {
    // Without an "error" listener, ioredis/BullMQ emit an unhandled "error"
    // event on a Redis blip, which takes the whole process down. The worker
    // should ride out a brief outage and reconnect instead.
    worker.on("error", (error) => {
      console.error(`[worker] redis/queue error on "${worker.name}":`, error);
    });

    // BullMQ emits "failed" for EVERY failed attempt, not only the last one, so
    // the message has to say which — otherwise the log reads as three separate
    // permanent failures when it is really one job being retried twice.
    worker.on("failed", (job, error) => {
      const attempt = job?.attemptsMade ?? 0;
      const allowed = job?.opts?.attempts ?? 1;
      const outcome = attempt >= allowed ? "no attempts left" : `will retry (${allowed - attempt} left)`;
      console.error(
        `[worker] job ${job?.id ?? "?"} on "${worker.name}" attempt ${attempt}/${allowed} failed, ${outcome}:`,
        error.message,
      );
    });
  }

  console.log(
    `[worker] listening prefix=${queuePrefix()} redis=${REDIS_URL} | ` +
      `"${AUDIO_QUEUE_NAME}" concurrency=${AUDIO_WORKER_CONCURRENCY}, ` +
      `"${BG_REMOVAL_QUEUE_NAME}" concurrency=${BG_REMOVAL_WORKER_CONCURRENCY} (rembg at ${process.env.REMBG_URL ?? "http://127.0.0.1:7000"})`,
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
      // Heartbeat first, so the health endpoint reports this process as down
      // while it is still draining rather than after it has gone.
      await heartbeat.stop();
      // BOTH workers, in parallel: closing only one would leave the other
      // holding a job when the supervisor's grace period runs out.
      await Promise.all(workers.map((worker) => worker.close()));
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
