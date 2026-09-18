import { prisma } from "@hpwd/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSET_QUOTA_MESSAGE, USER_ASSET_CAPS, isWithinAssetQuota } from "../storage-quota";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isWithinAssetQuota", () => {
  it("counts only this user's assets of this kind", async () => {
    const count = vi.spyOn(prisma.mediaAsset, "count").mockResolvedValue(0);

    await isWithinAssetQuota("audio", "user-1");

    expect(count).toHaveBeenCalledWith({ where: { userId: "user-1", kind: "audio" } });
  });

  // Strictly below the cap, because the caller is about to add one more.
  it("allows the upload that lands exactly on the cap", async () => {
    vi.spyOn(prisma.mediaAsset, "count").mockResolvedValue(USER_ASSET_CAPS.font - 1);
    expect(await isWithinAssetQuota("font", "user-1")).toBe(true);
  });

  it("refuses the one after that", async () => {
    vi.spyOn(prisma.mediaAsset, "count").mockResolvedValue(USER_ASSET_CAPS.font);
    expect(await isWithinAssetQuota("font", "user-1")).toBe(false);
  });

  // The rate limiter fails OPEN on a Redis error on purpose — an infra blip
  // must not stop a couple building their invitation. This one does not get
  // that treatment, and the reason is not a change of policy: the count runs
  // against the SAME database the upload is about to write its MediaAsset
  // row to. Swallowing the error here would let the request continue to a
  // write that cannot succeed, turning a clear failure into a confusing one.
  it("propagates a database error rather than guessing", async () => {
    vi.spyOn(prisma.mediaAsset, "count").mockRejectedValue(new Error("db down"));
    await expect(isWithinAssetQuota("image", "user-1")).rejects.toThrow("db down");
  });
});

describe("the configured caps", () => {
  it("covers every asset kind the schema allows", () => {
    expect(Object.keys(USER_ASSET_CAPS).sort()).toEqual(["audio", "font", "image"]);
  });

  // The spec allows 200 photos per invitation. A couple who builds several
  // invitations, replaces photos as they go, and runs some of them through
  // "Xoá nền" (which writes a NEW asset, never overwriting the original)
  // must never meet this. An hourly limit of 500 is what bounds a burst;
  // this is what bounds the total, which nothing did before.
  it("leaves room for several full albums plus churn", () => {
    expect(USER_ASSET_CAPS.image).toBeGreaterThanOrEqual(200 * 10);
  });

  it("is a total, not a rate — every cap is far above its own hourly limit", async () => {
    const { USER_RATE_LIMITS } = await import("../user-rate-limit");
    expect(USER_ASSET_CAPS.image).toBeGreaterThan(USER_RATE_LIMITS.imageUpload.limit);
    expect(USER_ASSET_CAPS.audio).toBeGreaterThan(USER_RATE_LIMITS.audioUpload.limit);
    expect(USER_ASSET_CAPS.font).toBeGreaterThan(USER_RATE_LIMITS.fontUpload.limit);
  });
});

describe("ASSET_QUOTA_MESSAGE", () => {
  it.each(["image", "audio", "font"] as const)("says the actual number for %s", (kind) => {
    expect(ASSET_QUOTA_MESSAGE[kind]).toContain(USER_ASSET_CAPS[kind].toLocaleString("vi-VN"));
  });

  // A cap nobody can act on is a dead end. There is no way to delete an
  // uploaded image today, so the message must not tell anyone to.
  it("does not tell the user to delete images, which no route lets them do", () => {
    expect(ASSET_QUOTA_MESSAGE.image).not.toContain("xoá");
    expect(ASSET_QUOTA_MESSAGE.image).not.toContain("xóa");
  });
});
