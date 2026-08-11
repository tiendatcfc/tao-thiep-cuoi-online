// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { formatEventDate } from "../EventsSection";

/**
 * B5: see `lib/__tests__/date.test.ts` for the general rationale. This
 * instant is 2026-12-19T18:30 UTC / 2026-12-20T01:30 in `Asia/Ho_Chi_Minh`
 * — the previous calendar day in UTC, the event's actual day in Vietnam.
 */
const MIDNIGHT_STRADDLING_INSTANT = "2026-12-19T18:30:00Z";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("EventsSection.formatEventDate", () => {
  it("renders the same (Vietnamese) calendar day under both TZ=UTC and TZ=Asia/Ho_Chi_Minh", () => {
    process.env.TZ = "UTC";
    const underUtc = formatEventDate(MIDNIGHT_STRADDLING_INSTANT);
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const underIct = formatEventDate(MIDNIGHT_STRADDLING_INSTANT);

    expect(underUtc).toBe(underIct);
    expect(underUtc).toBe("20/12/2026");
  });

  it("returns null for an unparseable date", () => {
    expect(formatEventDate("not a date")).toBeNull();
  });
});
