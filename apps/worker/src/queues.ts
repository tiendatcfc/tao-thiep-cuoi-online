import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from "bullmq";

/**
 * SHARED CONTRACT between the producer (apps/web) and the consumer
 * (apps/worker). This file is the package entry point (`main` in
 * package.json) precisely so that `import ... from "@hpwd/worker"` can never
 * reach `index.ts` — that module BOOTS A WORKER as a side effect of being
 * imported, and pulling it into the Next.js server would start a second
 * consumer inside the web process on every cold start.
 *
 * Nothing in here may have import-time side effects, for the same reason.
 */

/**
 * The queue name is a deployment-level identifier: a running worker subscribes
 * to this exact string in Redis. Changing it means a newly deployed web app
 * enqueues into a queue nothing is listening on, and the jobs pile up with no
 * error anywhere — so it is defined once, here, and imported on both sides
 * rather than written as a literal in two places.
 */
export const AUDIO_QUEUE_NAME = "audio-transcode";

/** Two concurrent transcodes per worker process: ffmpeg is CPU-bound, so going wider than a couple of jobs just makes every job slower. */
export const AUDIO_WORKER_CONCURRENCY = 2;

export interface AudioJobData {
  /** `MediaAsset.id` the result is written back to. */
  assetId: string;
  /** Owner of the asset — used to build the destination key, and to keep one user's upload out of another's prefix. */
  userId: string;
  /** Object key of the file the user PUT, relative to the bucket. */
  sourceKey: string;
}

export const AUDIO_JOB_OPTIONS: JobsOptions = {
  // 1 initial attempt + 2 retries. Transcoding fails for transient reasons
  // (object storage blip, worker restarted mid-job) as well as permanent ones
  // (the file is not audio); retrying costs one more ffmpeg run and saves the
  // transient case from surfacing to the couple as a permanent failure.
  attempts: 3,
  // Exponential from 5s, so a storage outage is not hammered by every queued
  // job at once.
  backoff: { type: "exponential", delay: 5_000 },
  // Unbounded job history would grow forever in the same Redis that holds the
  // rate-limit keys. Failures are kept far longer than successes because they
  // are the only ones anyone ever needs to read back.
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

/**
 * Key prefix every BullMQ key is namespaced under.
 *
 * Producer and consumer MUST agree, so both sides read it from here rather
 * than passing their own. Setting `BULLMQ_PREFIX` gives one Redis instance
 * several isolated queues — a staging deploy that shares production's Redis,
 * and the test suites, which would otherwise have their jobs eaten by the
 * worker `pnpm dev` now starts (and would then assert against queue state
 * that a live consumer is concurrently draining).
 */
export function queuePrefix(): string {
  // "bull" is bullmq's own default; keeping it means an existing deployment
  // that sets nothing keeps reading the keys it already has.
  return process.env.BULLMQ_PREFIX ?? "bull";
}

export interface AudioQueueOptions {
  /** Overrides `BULLMQ_PREFIX` for one queue. Tests pass an isolated value; production leaves it unset. */
  prefix?: string;
}

/**
 * Re-exported so apps/web can type a queue handle without taking a direct
 * dependency on bullmq's own type surface.
 */
export type AudioQueue = Queue<AudioJobData>;

/** Producer side. Used by apps/web to enqueue; the worker never calls this. */
export function createAudioQueue(
  connection: ConnectionOptions,
  options: AudioQueueOptions = {},
): Queue<AudioJobData> {
  return new Queue<AudioJobData>(AUDIO_QUEUE_NAME, {
    connection,
    prefix: options.prefix ?? queuePrefix(),
    defaultJobOptions: AUDIO_JOB_OPTIONS,
  });
}

/**
 * Consumer side. Takes the processor as an argument rather than importing it,
 * so this contract module stays free of ffmpeg, S3 and Prisma — and so tests
 * can round-trip a job through real Redis with a trivial handler.
 */
export function createAudioWorker(
  connection: ConnectionOptions,
  processor: Processor<AudioJobData>,
  options: AudioQueueOptions = {},
): Worker<AudioJobData> {
  return new Worker<AudioJobData>(AUDIO_QUEUE_NAME, processor, {
    connection,
    prefix: options.prefix ?? queuePrefix(),
    concurrency: AUDIO_WORKER_CONCURRENCY,
  });
}


// ---------------------------------------------------------------------------
// Background removal (spec feature 15)
// ---------------------------------------------------------------------------

/** Same deployment-level contract as `AUDIO_QUEUE_NAME`: one string, imported on both sides, never written as a literal twice. */
export const BG_REMOVAL_QUEUE_NAME = "background-removal";

/**
 * One job at a time per process, unlike audio's two.
 *
 * ONNX inference already spreads itself across cores, so running two
 * cut-outs concurrently does not finish two photos any sooner — it just
 * doubles peak memory (the model alone is hundreds of megabytes) and makes
 * both couples wait longer for their first result.
 */
export const BG_REMOVAL_WORKER_CONCURRENCY = 1;

export interface BgRemovalJobData {
  /** `MediaAsset.id` of the photo to cut out. Kept so the original is never touched — the couple must be able to undo. */
  sourceAssetId: string;
  /** `MediaAsset.id` the transparent PNG is written back to. Created up front, `status: "processing"`. */
  targetAssetId: string;
  /** Owner of both assets — used to build the destination key, and to keep one user's upload out of another's prefix. */
  userId: string;
  /** Object key of the source image variant to cut out, relative to the bucket. */
  sourceKey: string;
}

/** Same retry policy as audio, and for the same reasons — see `AUDIO_JOB_OPTIONS`. */
export const BG_REMOVAL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export type BgRemovalQueue = Queue<BgRemovalJobData>;

/** Producer side. Used by apps/web to enqueue; the worker never calls this. */
export function createBgRemovalQueue(
  connection: ConnectionOptions,
  options: AudioQueueOptions = {},
): Queue<BgRemovalJobData> {
  return new Queue<BgRemovalJobData>(BG_REMOVAL_QUEUE_NAME, {
    connection,
    prefix: options.prefix ?? queuePrefix(),
    defaultJobOptions: BG_REMOVAL_JOB_OPTIONS,
  });
}

/** Consumer side. Takes the processor as an argument for the same reason `createAudioWorker` does. */
export function createBgRemovalWorker(
  connection: ConnectionOptions,
  processor: Processor<BgRemovalJobData>,
  options: AudioQueueOptions = {},
): Worker<BgRemovalJobData> {
  return new Worker<BgRemovalJobData>(BG_REMOVAL_QUEUE_NAME, processor, {
    connection,
    prefix: options.prefix ?? queuePrefix(),
    concurrency: BG_REMOVAL_WORKER_CONCURRENCY,
  });
}
