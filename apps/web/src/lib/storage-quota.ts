import { prisma, type AssetKind } from "@hpwd/db";

/**
 * Per-user LIFETIME caps on how many assets one account may own.
 *
 * `user-rate-limit.ts` bounds how fast a signed-in user can upload. It does
 * not bound how much they can accumulate: 500 images an hour is 12,000 a
 * day, every day, for as long as the account exists. Google accounts are
 * free and unlimited, so "signed in" is not a barrier, and this project
 * self-hosts its own object storage — the bill for an unbounded loop lands
 * on the person running it, not on a platform that would notice first.
 *
 * Every number below is sized so that a couple doing the most the product
 * invites them to do never meets it. They are cost guards, not quotas
 * anyone has paid for, which is also why the overshoot described in
 * `isWithinAssetQuota` is acceptable.
 */
export const USER_ASSET_CAPS: Record<AssetKind, number> = {
  /**
   * The spec allows 200 photos per invitation. Ten full albums, before
   * counting that replacing a photo in the editor writes a NEW asset and
   * leaves the old one, and that "Xoá nền" also writes a new asset rather
   * than overwriting the original. Each image is capped at 10MB of source
   * and stored as three WebP variants, so this bounds one account at tens
   * of gigabytes in the worst case — where before it bounded nothing.
   */
  image: 5_000,
  /** One track per invitation, capped at 15MB each. A hundred is already someone testing. */
  audio: 100,
  /** Two families x two weights is a rich setup; 5MB each, and fifty is ten times that. */
  font: 50,
};

/**
 * `true` when this user may create one more asset of `kind`.
 *
 * Checked strictly below the cap because the caller is about to add the
 * one that would reach it.
 *
 * Two uploads racing can both read `cap - 1` and both proceed, so an
 * account can end up a handful of assets over. That is deliberate: making
 * it exact needs a transaction or a counter row on the hot path of every
 * upload, and the cap exists to stop a runaway loop, not to meter a
 * product — being off by the client's concurrency changes nothing about
 * what it prevents.
 *
 * Unlike `rateLimitUser`, this does NOT fail open. It counts rows in the
 * same database the upload is about to write its `MediaAsset` to, so an
 * error here means the write cannot succeed either; continuing would only
 * move the failure somewhere less clear.
 */
export async function isWithinAssetQuota(kind: AssetKind, userId: string): Promise<boolean> {
  const owned = await prisma.mediaAsset.count({ where: { userId, kind } });
  return owned < USER_ASSET_CAPS[kind];
}

/**
 * Vietnamese, states the actual number, and asks for the one thing the
 * person can actually do. There is no route that deletes an uploaded image
 * today, so the image message must not suggest deleting any — an error
 * that names an impossible remedy is worse than one that names none.
 */
export const ASSET_QUOTA_MESSAGE: Record<AssetKind, string> = {
  image: `Tài khoản của bạn đã đạt giới hạn ${USER_ASSET_CAPS.image.toLocaleString("vi-VN")} ảnh. Vui lòng liên hệ hỗ trợ nếu bạn cần thêm.`,
  audio: `Tài khoản của bạn đã đạt giới hạn ${USER_ASSET_CAPS.audio.toLocaleString("vi-VN")} bản nhạc. Vui lòng liên hệ hỗ trợ nếu bạn cần thêm.`,
  font: `Tài khoản của bạn đã đạt giới hạn ${USER_ASSET_CAPS.font.toLocaleString("vi-VN")} font. Vui lòng xoá bớt font cũ rồi thử lại.`,
};
