import Redis from "ioredis";

/**
 * Module-level singleton Redis client — same hot-reload guard pattern as
 * `@hpwd/db`'s prisma singleton, so Next's dev-mode module reloading (and
 * repeated `rateLimit` calls across requests) reuses one connection instead
 * of opening a new one every time.
 *
 * The connection starts immediately (not `lazyConnect`), and commands
 * issued before it's ready are queued (the default) rather than rejected
 * outright — against a reachable Redis that queue drains in a few ms once
 * the handshake finishes, so a burst of calls right after a cold start
 * still all succeed instead of racing the handshake. `connectTimeout` +
 * `retryStrategy` + `maxRetriesPerRequest` together bound how long a
 * genuinely dead/unreachable Redis can hold up a command before
 * `rateLimit`'s fail-open catch below kicks in — a stalled Redis must never
 * make guests wait to submit a wish, let alone block them.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

function getRedisClient(): Redis {
  if (!globalForRedis.redis) {
    const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 100, 500)),
    });
    // Without a listener, ioredis's default behavior is to throw on an
    // "error" event, which would crash the process on a Redis blip. Every
    // call site already catches and fails open, so this listener only
    // exists to keep that default from taking the whole app down; the
    // actual handling/logging happens in `rateLimit`'s catch block.
    client.on("error", () => {});
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}

/** Test-only escape hatch: drops the cached client so a changed `REDIS_URL` or a fresh connection state can be exercised, and lets `vitest run` exit cleanly instead of leaving a live socket open. */
export function disconnectRateLimitRedis(): void {
  globalForRedis.redis?.disconnect();
  globalForRedis.redis = undefined;
}

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

/**
 * Fixed-window rate limiter backed by Redis: `INCR key`, and on the first
 * hit in a fresh window (`count === 1`) sets that key to expire after
 * `windowSec`. Returns `true` (allowed) while the running count is within
 * `limit`, `false` (throttled) once it's exceeded.
 *
 * Fails open — returns `true` and logs via `console.error` — on any Redis
 * error. A dead Redis on a wedding day must never block a guest from
 * submitting an RSVP or a wish; the alternative (failing closed) turns an
 * infra blip into a full outage of the public-facing form.
 */
export async function rateLimit(key: string, opts: RateLimitOptions): Promise<boolean> {
  const { limit, windowSec } = opts;
  try {
    const redis = getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }
    return count <= limit;
  } catch (error) {
    console.error("rateLimit: Redis error, failing open (request allowed):", error);
    return true;
  }
}
