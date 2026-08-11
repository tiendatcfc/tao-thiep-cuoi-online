import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectRateLimitRedis, rateLimit } from "../rate-limit";

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
