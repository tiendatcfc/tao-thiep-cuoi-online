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
    ...opts,
  }).format(date);
}
