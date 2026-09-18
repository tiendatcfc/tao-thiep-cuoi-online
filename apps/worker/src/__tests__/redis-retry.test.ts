import { describe, expect, it } from "vitest";
import { redisRetryStrategy } from "../queues";

/**
 * ioredis stops reconnecting for good the moment `retryStrategy` returns
 * anything that is not a number. Every connection in this repo used to say
 * `times > N ? null : …`, so one Redis restart left the web process unable
 * to reach Redis for the rest of its life — rate limiting failed open on
 * every request and job enqueuing stayed broken, both silently.
 */
describe("redisRetryStrategy", () => {
  it("never gives up, however many attempts have failed", () => {
    for (const times of [1, 2, 3, 10, 100, 10_000]) {
      expect(typeof redisRetryStrategy(times)).toBe("number");
    }
  });

  it("backs off, so a dead Redis is not hammered", () => {
    expect(redisRetryStrategy(1)).toBeLessThan(redisRetryStrategy(5));
  });

  // Unbounded backoff would mean a process that lost Redis early takes
  // minutes to notice it is back.
  it("caps the wait so recovery is prompt", () => {
    expect(redisRetryStrategy(10_000)).toBeLessThanOrEqual(5_000);
  });
});
