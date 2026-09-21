import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageRange, resolvePage, totalPagesFor } from "../pagination";

describe("resolvePage", () => {
  it("defaults to page 1 when there is no ?trang=", () => {
    expect(resolvePage(undefined, 5)).toBe(1);
  });

  // A couple who edits the URL, or follows a link from a time when there
  // were more wishes, must land somewhere that exists — not on an empty list
  // with no way back.
  it.each([
    ["junk", "abc", 5, 1],
    ["zero", "0", 5, 1],
    ["negative", "-3", 5, 1],
    ["empty", "", 5, 1],
    ["past the end", "99", 5, 5],
  ])("clamps %s into range", (_label, raw, totalPages, expected) => {
    expect(resolvePage(raw, totalPages)).toBe(expected);
  });

  it("takes the first value when the param is repeated", () => {
    expect(resolvePage(["2", "9"], 5)).toBe(2);
  });

  it("never returns 0 even when there are no pages at all", () => {
    expect(resolvePage("1", 0)).toBe(1);
  });
});

describe("totalPagesFor", () => {
  it.each([
    [0, 1],
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [PAGE_SIZE * 3, 3],
  ])("reports %i rows as %i page(s)", (total, expected) => {
    expect(totalPagesFor(total)).toBe(expected);
  });
});

describe("pageRange", () => {
  it("counts from 1 on the first page", () => {
    expect(pageRange(1, PAGE_SIZE, 120)).toEqual({ first: 1, last: PAGE_SIZE });
  });

  it("offsets by the pages before it", () => {
    expect(pageRange(3, 20, 120)).toEqual({ first: 101, last: 120 });
  });

  it("reports 0–0 rather than 1–0 for an empty list", () => {
    expect(pageRange(1, 0, 0)).toEqual({ first: 0, last: 0 });
  });
});
