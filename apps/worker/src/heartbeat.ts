import Redis from "ioredis";
import {
  redisRetryStrategy,
  workerHeartbeatKey,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_TTL_SEC,
} from "./queues";

/**
 * Writes "the worker is alive" into Redis on a timer, for `/api/health` to
 * read. See `workerHeartbeatKey` in `queues.ts` for why this exists at all:
 * a dead worker is invisible from the outside, because the web app keeps
 * answering perfectly while every upload waits forever.
 */
export interface Heartbeat {
  stop(): Promise<void>;
}

export function startHeartbeat(redisUrl: string): Heartbeat {
  // Its own connection, not one borrowed from BullMQ: a Worker's connection
  // spends most of its life inside a blocking BRPOPLPUSH, and issuing an
  // unrelated SET on it is how you get a heartbeat that only lands between
  // jobs — i.e. exactly never on a busy worker, which is the moment the
  // check most needs to say "alive".
  const client = new Redis(redisUrl, {
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    retryStrategy: redisRetryStrategy,
  });

  // A Redis blip must not take the worker down; the heartbeat going stale is
  // the correct visible consequence, and the next write recovers it.
  client.on("error", (error) => {
    console.error("[worker] heartbeat redis error:", error.message);
  });

  const write = (): void => {
    void client
      .set(workerHeartbeatKey(), new Date().toISOString(), "EX", WORKER_HEARTBEAT_TTL_SEC)
      .catch((error: unknown) => {
        console.error("[worker] could not write heartbeat:", error);
      });
  };

  write();
  const timer = setInterval(write, WORKER_HEARTBEAT_INTERVAL_MS);
  // The heartbeat must never be the reason the process stays alive during a
  // shutdown that is otherwise finished.
  timer.unref();

  return {
    async stop(): Promise<void> {
      clearInterval(timer);
      // Deleted rather than left to expire: a clean shutdown is known to be
      // down NOW, and waiting a minute to say so during a deploy would make
      // every restart look like an incident.
      await client.del(workerHeartbeatKey()).catch(() => {});
      client.disconnect();
    },
  };
}
