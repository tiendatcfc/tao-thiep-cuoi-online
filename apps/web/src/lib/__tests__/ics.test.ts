import { describe, expect, it } from "vitest";
import { buildIcs, icsFileName } from "../ics";

const NOW = new Date("2026-09-22T03:00:00.000Z");

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildIcs", () => {
  it("writes a parseable single-event calendar in UTC", () => {
    const ics = buildIcs({
      start: "2026-12-20T18:00:00+07:00",
      durationMinutes: 180,
      summary: "Lễ Thành Hôn",
      now: NOW,
    })!;

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // 18:00 +07:00 is 11:00 UTC. Written in UTC so the guest's own client
    // converts to wherever they are, which is the point for anyone
    // travelling to the wedding.
    expect(lines(ics)).toContain("DTSTART:20261220T110000Z");
    expect(lines(ics)).toContain("DTEND:20261220T140000Z");
    expect(lines(ics)).toContain("DTSTAMP:20260922T030000Z");
    expect(lines(ics)).toContain("SUMMARY:Lễ Thành Hôn");
  });

  it("escapes the delimiters RFC 5545 reserves inside a text value", () => {
    // A Vietnamese venue line contains commas as a matter of course, and an
    // unescaped one silently truncates the field in most clients.
    const ics = buildIcs({
      start: "2026-12-20T18:00:00+07:00",
      durationMinutes: 60,
      summary: "Tiệc; cưới",
      location: "194 Hoàng Văn Thụ, Phú Nhuận, TP.HCM",
      description: "Dòng một\nDòng hai",
      now: NOW,
    })!;

    expect(ics).toContain("SUMMARY:Tiệc\; cưới");
    expect(ics).toContain("194 Hoàng Văn Thụ\\, Phú Nhuận\\, TP.HCM");
    expect(ics).toContain("DESCRIPTION:Dòng một\\nDòng hai");
  });

  it("folds long lines at 75 OCTETS, never mid-character", () => {
    // The reason this is asserted in bytes: a Vietnamese address is three
    // bytes per accented letter, so a 75-CHARACTER fold produces lines well
    // over the limit, and a naive byte split lands inside a UTF-8 sequence
    // and corrupts the file.
    const long = "Trung tâm Hội nghị Tiệc cưới White Palace, 194 Hoàng Văn Thụ, Phường 9, Quận Phú Nhuận, Thành phố Hồ Chí Minh";
    const ics = buildIcs({
      start: "2026-12-20T18:00:00+07:00",
      durationMinutes: 60,
      summary: "Lễ Thành Hôn",
      location: long,
      now: NOW,
    })!;

    const encoder = new TextEncoder();
    for (const line of lines(ics)) {
      expect(encoder.encode(line).length, line).toBeLessThanOrEqual(75);
    }
    // Continuations start with one space, and unfolding restores the text.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(long.replace(/,/g, "\\,"));
  });

  it("gives the same UID for the same event, so tapping twice updates one entry", () => {
    const event = { start: "2026-12-20T18:00:00+07:00", durationMinutes: 180, summary: "Lễ Thành Hôn" };
    const a = buildIcs({ ...event, now: NOW })!;
    const b = buildIcs({ ...event, now: new Date("2026-10-01T00:00:00.000Z") })!;

    const uidOf = (ics: string) => lines(ics).find((l) => l.startsWith("UID:"));
    expect(uidOf(a)).toBe(uidOf(b));
  });

  it("returns null for a date the couple never filled in", () => {
    // Rather than a calendar entry titled "Invalid Date": the caller hides
    // the button instead.
    expect(buildIcs({ start: "", durationMinutes: 60, summary: "x" })).toBeNull();
    expect(buildIcs({ start: "không phải ngày", durationMinutes: 60, summary: "x" })).toBeNull();
  });
});

describe("icsFileName", () => {
  it("strips Vietnamese diacritics instead of percent-escaping them", () => {
    expect(icsFileName("Lễ Thành Hôn")).toBe("le-thanh-hon.ics");
    expect(icsFileName("Đám cưới")).toBe("dam-cuoi.ics");
  });

  it("never produces a nameless file", () => {
    expect(icsFileName("")).toBe("su-kien.ics");
    expect(icsFileName("!!!")).toBe("su-kien.ics");
  });
});
