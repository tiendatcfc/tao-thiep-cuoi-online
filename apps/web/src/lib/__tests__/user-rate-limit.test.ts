import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitUser, USER_RATE_LIMITS } from "../user-rate-limit";
import * as rateLimitModule from "../rate-limit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimitUser", () => {
  // Behind carrier-grade NAT — universal on Vietnamese mobile networks —
  // an IP key would make two unrelated couples on the same carrier share a
  // quota. For these routes the account is known, so it is what gets
  // limited.
  it("keys on the user, and names the action so two actions cannot share a bucket", async () => {
    const spy = vi.spyOn(rateLimitModule, "rateLimit").mockResolvedValue(true);

    await rateLimitUser("audioUpload", "user-1");
    await rateLimitUser("fontUpload", "user-1");
    await rateLimitUser("audioUpload", "user-2");

    expect(spy.mock.calls.map((call) => call[0])).toEqual([
      "user:audioUpload:user-1",
      "user:fontUpload:user-1",
      "user:audioUpload:user-2",
    ]);
  });

  it("passes the configured limit through", async () => {
    const spy = vi.spyOn(rateLimitModule, "rateLimit").mockResolvedValue(true);

    await rateLimitUser("backgroundRemoval", "user-1");

    expect(spy.mock.calls[0]?.[1]).toEqual(USER_RATE_LIMITS.backgroundRemoval);
  });

  it("reports the limiter's answer unchanged", async () => {
    vi.spyOn(rateLimitModule, "rateLimit").mockResolvedValue(false);
    expect(await rateLimitUser("imageUpload", "user-1")).toBe(false);
  });
});

describe("the configured limits", () => {
  // The spec allows 200 photos per invitation and a couple uploads an album
  // in one sitting. A limit that a normal album can reach is a bug report
  // from someone doing exactly what the product invites them to do.
  it("clears a full 200-photo album with room to spare", () => {
    expect(USER_RATE_LIMITS.imageUpload.limit).toBeGreaterThanOrEqual(400);
  });

  it("gives every action an hour-scale window rather than a per-minute one", () => {
    for (const [kind, config] of Object.entries(USER_RATE_LIMITS)) {
      expect(config.windowSec, kind).toBeGreaterThanOrEqual(3600);
      expect(config.limit, kind).toBeGreaterThan(0);
    }
  });

  // Every one of these routes spends real CPU: sharp re-encodes, ffmpeg,
  // fontkit on untrusted binary, and a queue that runs at concurrency 1.
  it("covers every expensive authenticated route", () => {
    expect(Object.keys(USER_RATE_LIMITS).sort()).toEqual([
      "audioUpload",
      "backgroundRemoval",
      "fontUpload",
      "imageUpload",
      "invitationCreate",
    ]);
  });
});
