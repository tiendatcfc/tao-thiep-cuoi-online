// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeddingCalendar, calendarMonthOf, monthGrid } from "../decor/WeddingCalendar";

describe("calendarMonthOf", () => {
  it("reads the calendar day as seen in Vietnam, not on the rendering server", () => {
    // 2026-12-20T00:30+07:00 is still 2026-12-19 in UTC. A server in
    // London running `getDate()` would put this wedding on the 19th and
    // mark the wrong square, which is the whole reason this goes through
    // `formatToParts` with an explicit timeZone.
    expect(calendarMonthOf("2026-12-20T00:30:00+07:00")).toEqual({ year: 2026, month: 12, day: 20 });
    // And the other direction: late evening in Vietnam is the NEXT day in
    // UTC, so a naive UTC read would be a day late.
    expect(calendarMonthOf("2026-12-20T23:30:00+07:00")).toEqual({ year: 2026, month: 12, day: 20 });
  });

  it("returns null for a date the couple never filled in", () => {
    expect(calendarMonthOf("")).toBeNull();
    expect(calendarMonthOf("không phải ngày")).toBeNull();
  });
});

describe("monthGrid", () => {
  it("pads the first row so the 1st lands under its own weekday, counting from Monday", () => {
    // 1 December 2026 is a Tuesday, so one blank sits before it.
    expect(monthGrid({ year: 2026, month: 12 }).slice(0, 3)).toEqual([null, 1, 2]);
    // 1 February 2027 is a Monday: no padding at all, the case an
    // off-by-one in the Sunday→Monday shift would break.
    expect(monthGrid({ year: 2027, month: 2 })[0]).toBe(1);
    // 1 March 2026 is a Sunday — six blanks, the maximum, and the case a
    // naive `getUTCDay()` would give zero.
    expect(monthGrid({ year: 2026, month: 3 }).slice(0, 7)).toEqual([null, null, null, null, null, null, 1]);
  });

  it("ends on the real last day of the month, including a leap February", () => {
    expect(monthGrid({ year: 2026, month: 12 }).at(-1)).toBe(31);
    expect(monthGrid({ year: 2026, month: 2 }).at(-1)).toBe(28);
    expect(monthGrid({ year: 2028, month: 2 }).at(-1)).toBe(29);
  });
});

describe("WeddingCalendar", () => {
  it("marks the wedding day and labels it for a screen reader", () => {
    render(<WeddingCalendar date="2026-12-20T18:00:00+07:00" />);

    expect(screen.getByRole("grid", { name: "Lịch tháng 12 năm 2026" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày cưới, 20")).toBeInTheDocument();
    // The other days are present as plain cells, not as the marked one.
    expect(screen.queryByLabelText("Ngày cưới, 19")).not.toBeInTheDocument();
  });

  it("renders nothing rather than an empty month when there is no date", () => {
    const { container } = render(<WeddingCalendar date="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
