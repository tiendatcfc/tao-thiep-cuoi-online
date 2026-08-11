// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { daysRemaining, formatVietnameseDate } from "../CoverSection";

/**
 * B5: see `lib/__tests__/date.test.ts` for the general rationale. This
 * instant is 2026-12-19T18:30 UTC / 2026-12-20T01:30 in `Asia/Ho_Chi_Minh`
 * — the previous calendar day in UTC, the wedding's actual day in Vietnam.
 */
const MIDNIGHT_STRADDLING_INSTANT = "2026-12-19T18:30:00Z";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("CoverSection.formatVietnameseDate", () => {
  it("renders the same (Vietnamese) calendar day under both TZ=UTC and TZ=Asia/Ho_Chi_Minh", () => {
    process.env.TZ = "UTC";
    const underUtc = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const underIct = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);

    expect(underUtc).toBe(underIct);
    expect(underUtc).toContain("20/12/2026");
  });
});

describe("CoverSection.daysRemaining", () => {
  // `now` is the wedding-day morning itself, in Vietnam, a few hours before
  // the ceremony — but still the previous calendar day in UTC. The couple
  // should see "Hôm nay" (today), not "còn 1 ngày nữa" (one more day),
  // regardless of the rendering server's local timezone.
  const WEDDING_INSTANT = "2026-12-20T02:00:00Z"; // 09:00 ICT on 20/12
  const NOW_SAME_VN_DAY_EARLIER = new Date("2026-12-19T22:00:00Z"); // 05:00 ICT on 20/12

  it("treats the wedding as 'today' (0 days) once it's the same Vietnamese calendar day, under both TZ=UTC and TZ=Asia/Ho_Chi_Minh", () => {
    process.env.TZ = "UTC";
    const underUtc = daysRemaining(WEDDING_INSTANT, NOW_SAME_VN_DAY_EARLIER);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const underIct = daysRemaining(WEDDING_INSTANT, NOW_SAME_VN_DAY_EARLIER);

    expect(underUtc).toBe(0);
    expect(underIct).toBe(0);
  });

  it("counts one full Vietnamese calendar day when 'now' is the day before, consistently across timezones", () => {
    const oneVnDayBefore = new Date("2026-12-18T20:00:00Z"); // 03:00 ICT on 19/12
    process.env.TZ = "UTC";
    const underUtc = daysRemaining(WEDDING_INSTANT, oneVnDayBefore);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const underIct = daysRemaining(WEDDING_INSTANT, oneVnDayBefore);

    expect(underUtc).toBe(1);
    expect(underIct).toBe(1);
  });

  it("returns null for a past date", () => {
    expect(daysRemaining("2020-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(daysRemaining("not a date")).toBeNull();
  });
});
