/**
 * Page-number handling for the owner's list pages.
 *
 * This lived inside `phan-hoi/page.tsx` until the wishes moderation page
 * needed the same thing. Two copies of "parse ?trang=, clamp it" is how the
 * two pages end up disagreeing about what `?trang=0` means — so it is one
 * function, in one place, with its own tests.
 */

/** 50 rows a page, the number the Phase 2 plan specified for responses. */
export const PAGE_SIZE = 50;

/**
 * Reads `?trang=`, clamped into range.
 *
 * Junk, zero, negative and out-of-range values all land on a page that
 * exists rather than an empty list with no way back — a couple who edits the
 * URL, or follows a stale link after wishes were deleted, must not end up
 * staring at nothing.
 */
export function resolvePage(raw: string | string[] | undefined, totalPages: number): number {
  const value = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, Math.max(totalPages, 1));
}

/** Total pages for `total` rows, never below 1 so "trang 1/1" holds when the list is empty. */
export function totalPagesFor(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The 1-based range shown on `page`, for the "Đang hiện a–b trong n" line. */
export function pageRange(
  page: number,
  countOnPage: number,
  total: number,
  pageSize: number = PAGE_SIZE,
): { first: number; last: number } {
  if (total === 0 || countOnPage === 0) return { first: 0, last: 0 };
  const first = (page - 1) * pageSize + 1;
  return { first, last: (page - 1) * pageSize + countOnPage };
}
