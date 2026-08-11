/**
 * Vietnam has a single timezone (no DST) and this app is Vietnamese-only by
 * design — every date shown to a couple or their guests must render in
 * `Asia/Ho_Chi_Minh` regardless of which timezone the rendering server (or
 * the guest's device clock) happens to be in. Without an explicit
 * `timeZone`, `Intl.DateTimeFormat` falls back to the runtime's local
 * timezone, which for a server means "wherever the process happens to be
 * deployed" — a morning ceremony (the Vietnamese norm) stored as a UTC
 * instant renders a day early on a UTC server.
 */
export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * Formats an ISO date string as a short Vietnamese date (`dd/mm/yyyy`, plus
 * optional time), returning `""` for an unparseable input rather than
 * throwing or rendering "Invalid Date". Shared by `WishesSection` and
 * `WishModerationRow`, which both display a wish's `createdAt` and only
 * differ on whether the time-of-day is included.
 */
export function formatVietnameseDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIME_ZONE,
    ...opts,
  }).format(date);
}
