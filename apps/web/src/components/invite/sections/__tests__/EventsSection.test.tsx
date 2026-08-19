// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventsSection, formatEventDate } from "../EventsSection";

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

function eventsSectionWithMapUrl(mapUrl: string): Extract<Section, { type: "events" }> {
  const base = createSection("events") as Extract<Section, { type: "events" }>;
  base.props.items = [
    { name: "Lễ Vu Quy", time: "09:00", date: "2026-12-20T09:00:00+07:00", address: "Nhà gái", mapUrl },
  ];
  return base;
}

describe("EventsSection — mapUrl scheme allowlist", () => {
  it("renders the map link for an https URL", () => {
    render(<EventsSection section={eventsSectionWithMapUrl("https://maps.google.com/x")} />);
    const link = screen.getByRole("link", { name: "Xem bản đồ" });
    expect(link).toHaveAttribute("href", "https://maps.google.com/x");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "maps.app.goo.gl/xyz"])(
    "renders NO anchor for unsafe or scheme-less mapUrl %s — the rest of the event still renders",
    (mapUrl) => {
      render(<EventsSection section={eventsSectionWithMapUrl(mapUrl)} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("Lễ Vu Quy")).toBeInTheDocument();
      expect(screen.getByText("Nhà gái")).toBeInTheDocument();
    },
  );
});
