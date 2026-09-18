import { rateLimit } from "./rate-limit";

/**
 * Per-USER limits for the expensive authenticated routes.
 *
 * Until now only `wishes` and `submissions` were limited, both per IP,
 * because those are the two anonymous endpoints. Everything a signed-in
 * couple can do was unlimited — and "signed in" is not a meaningful barrier
 * here: Google accounts are free and unlimited, so anyone willing to click
 * through a sign-in could run an unbounded loop against the routes that
 * re-encode images with sharp, spawn ffmpeg, parse font files, or queue CPU
 * time on the background-removal service.
 *
 * Keyed by user id, NOT by IP. Behind carrier-grade NAT — universal on
 * Vietnamese mobile networks — an IP key would make two unrelated couples
 * on the same carrier share a quota. The account is the thing being
 * limited, and for these routes it is already known.
 *
 * The numbers are sized to be invisible to real use and still bound a
 * runaway script; each one says what it is measured against, because a
 * limit whose reasoning is lost gets "tuned" by the next person with no way
 * to tell generous from arbitrary.
 */
export const USER_RATE_LIMITS = {
  /**
   * The spec allows 200 photos per invitation, and a couple uploading an
   * album does it in one sitting — so this has to clear a bulk upload of a
   * full album, twice over, without the couple ever noticing it exists.
   */
  imageUpload: { limit: 500, windowSec: 3600 },
  /** One track per invitation. Ten an hour is already someone changing their mind repeatedly. */
  audioUpload: { limit: 10, windowSec: 3600 },
  /** Two families of custom fonts is a lot; this allows ten uploads an hour. */
  fontUpload: { limit: 10, windowSec: 3600 },
  /** Creating invitations is cheap, but an unbounded loop is still a table nobody can read. */
  invitationCreate: { limit: 30, windowSec: 3600 },
  /**
   * The one queue that is CPU-bound end to end: rembg runs at concurrency 1,
   * so this is the route where one user can starve every other user's jobs.
   * Still well above cutting out every photo in a normal album.
   */
  backgroundRemoval: { limit: 100, windowSec: 3600 },
} as const;

export type UserRateLimitKind = keyof typeof USER_RATE_LIMITS;

/**
 * `true` when the action is allowed.
 *
 * Fails OPEN on a Redis error, inheriting `rateLimit`'s behaviour on
 * purpose: these are the couple's own uploads for their own wedding, and an
 * infrastructure blip must not stop them building their invitation. The
 * limit is a guard against abuse, not a quota anyone has paid for.
 */
export async function rateLimitUser(kind: UserRateLimitKind, userId: string): Promise<boolean> {
  return rateLimit(`user:${kind}:${userId}`, USER_RATE_LIMITS[kind]);
}

/** One message for every one of these, in Vietnamese, saying what to do rather than what went wrong. */
export const USER_RATE_LIMIT_MESSAGE =
  "Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
