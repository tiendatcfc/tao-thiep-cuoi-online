import { afterEach, describe, expect, it } from "vitest";
import { formatVietnameseDate } from "../date";

/**
 * B5: an instant that straddles midnight in `Asia/Ho_Chi_Minh` (ICT,
 * UTC+7) while still being the PREVIOUS calendar day in UTC —
 * 2026-12-19T18:30:00Z is 2026-12-20T01:30 in Vietnam. Without an explicit
 * `timeZone`, `Intl.DateTimeFormat` falls back to the runtime's local
 * timezone, so the rendered date depends on wherever the process happens to
 * be running — this is exactly the "wrong date in SSR HTML depending on the
 * server's TZ" bug.
 */
const MIDNIGHT_STRADDLING_INSTANT = "2026-12-19T18:30:00Z";
const EXPECTED_VN_DATE = "20/12/2026";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("formatVietnameseDate (lib/date.ts)", () => {
  it("renders the Vietnamese calendar day, not the runtime's local day, under TZ=UTC", () => {
    process.env.TZ = "UTC";
    expect(formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT)).toBe(EXPECTED_VN_DATE);
  });

  it("renders the same Vietnamese calendar day under TZ=Asia/Ho_Chi_Minh", () => {
    process.env.TZ = "Asia/Ho_Chi_Minh";
    expect(formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT)).toBe(EXPECTED_VN_DATE);
  });

  it("is identical under both timezones — the real regression-proofing assertion", () => {
    process.env.TZ = "UTC";
    const underUtc = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const underIct = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);
    expect(underUtc).toBe(underIct);
  });

  it("still returns '' for an unparseable input regardless of timezone", () => {
    process.env.TZ = "UTC";
    expect(formatVietnameseDate("not a date")).toBe("");
  });
});
