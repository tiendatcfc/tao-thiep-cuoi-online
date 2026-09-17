import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectRateLimitRedis, rateLimit } from "../rate-limit";

/**
 * Polls `predicate` until it holds, instead of sleeping a fixed interval and
 * hoping. A timeout still fails the test, but only after genuinely waiting —
 * so a slow machine or a busy Redis no longer reports a false negative.
 */
async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Exercises `rateLimit` against the real dev Redis (docker `hpwd-redis`,
 * see docker-compose.dev.yml) rather than mocking ioredis — a fixed-window
 * INCR+EXPIRE limiter is exactly the kind of logic that a mock can get
 * subtly wrong (off-by-one on the boundary, expiry not actually applied).
 * Every test uses a fresh random key so runs never collide with each other
 * or with a previous run's leftover state.
 */
describe("rateLimit", () => {
  afterAll(() => {
    disconnectRateLimitRedis();
  });

  it("allows up to `limit` requests and blocks the next one", async () => {
    const key = `test:ratelimit:${randomUUID()}`;

    expect(await rateLimit(key, { limit: 3, windowSec: 5 })).toBe(true);
    expect(await rateLimit(key, { limit: 3, windowSec: 5 })).toBe(true);
    expect(await rateLimit(key, { limit: 3, windowSec: 5 })).toBe(true);
    expect(await rateLimit(key, { limit: 3, windowSec: 5 })).toBe(false);
  });

  it("resets and allows again once the window expires", async () => {
    const key = `test:ratelimit:${randomUUID()}`;

    expect(await rateLimit(key, { limit: 1, windowSec: 1 })).toBe(true);
    expect(await rateLimit(key, { limit: 1, windowSec: 1 })).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(await rateLimit(key, { limit: 1, windowSec: 1 })).toBe(true);
  }, 10000);

  it("tracks independent keys separately", async () => {
    const keyA = `test:ratelimit:${randomUUID()}`;
    const keyB = `test:ratelimit:${randomUUID()}`;

    expect(await rateLimit(keyA, { limit: 1, windowSec: 5 })).toBe(true);
    expect(await rateLimit(keyA, { limit: 1, windowSec: 5 })).toBe(false);
    expect(await rateLimit(keyB, { limit: 1, windowSec: 5 })).toBe(true);
  });

  // C3: proves the increment-and-set-expiry is genuinely ONE atomic Redis
  // operation, not two separate round trips (`INCR` then `EXPIRE`) — a
  // connection drop between two round trips would leave the key
  // incremented with no TTL, permanently rate-limiting that key. `MONITOR`
  // streams every command the Redis server actually receives, in the exact
  // order it received them, from every client — including this test's own
  // separate connection — so it can observe whether `rateLimit` sent a
  // single `EVAL`/`EVALSHA` (the fix) or a bare `INCR` as its own top-level
  // command (the pre-fix bug: the client would send `INCR`, wait for the
  // reply, then send `EXPIRE` as a second, independent command — exactly
  // the two-round-trip gap this closes).
  it("increments and sets the expiry as a single atomic operation (not two separate round trips)", async () => {
    const key = `test:ratelimit:atomic:${randomUUID()}`;
    const monitorConn = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    const monitor = await monitorConn.monitor();
    const observed: string[][] = [];
    monitor.on("monitor", (_time: string, args: string[]) => observed.push(args));

    const sentinelConn = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    try {
      // Wait for a condition rather than sleeping a fixed 100ms twice. The
      // fixed sleeps made this test fail roughly one run in five once the
      // suite gained other tests that also talk to this Redis: MONITOR
      // attaching, and a command streaming back through it, are both slower
      // under load, and neither has anything to do with what is being
      // asserted. ECHO of a unique token proves MONITOR is actually live
      // before the call it has to observe is made.
      const sentinel = `monitor-ready-${randomUUID()}`;
      await waitUntil(async () => {
        await sentinelConn.echo(sentinel);
        return observed.some((args) => args.includes(sentinel));
      });

      await rateLimit(key, { limit: 5, windowSec: 5 });
      await waitUntil(async () => observed.some((args) => args.includes(key)));

      const touchingKey = observed.filter((args) => args.includes(key));
      expect(touchingKey.length).toBeGreaterThan(0);
      // The very first thing the server saw for this key must be the atomic
      // script call — not a bare top-level `INCR`, which is what the
      // pre-fix two-round-trip implementation would have sent instead.
      expect(touchingKey[0]![0]!.toLowerCase()).toMatch(/^eval(sha)?$/);
    } finally {
      monitor.disconnect();
      monitorConn.disconnect();
      sentinelConn.disconnect();
    }
  });

  it("fails open (returns true) when Redis is unreachable", async () => {
    const originalUrl = process.env.REDIS_URL;
    // Reserved TEST-NET-1 address (RFC 5737) — never routable, so the
    // connection attempt fails fast instead of timing out on a filtered port.
    process.env.REDIS_URL = "redis://192.0.2.1:6379";
    disconnectRateLimitRedis();

    try {
      const key = `test:ratelimit:${randomUUID()}`;
      await expect(rateLimit(key, { limit: 1, windowSec: 5 })).resolves.toBe(true);
    } finally {
      disconnectRateLimitRedis();
      process.env.REDIS_URL = originalUrl;
    }
  }, 10000);
});
