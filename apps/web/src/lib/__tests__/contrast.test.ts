import { describe, expect, it } from "vitest";
import {
  INK_ON_DARK,
  INK_ON_LIGHT,
  contrastRatio,
  parseColor,
  readableInkOn,
  relativeLuminance,
} from "../contrast";

describe("parseColor", () => {
  it("reads the notations the editor's colour field and hand-typed themes produce", () => {
    expect(parseColor("#A62B45")).toEqual({ r: 166, g: 43, b: 69 });
    expect(parseColor("a62b45")).toEqual({ r: 166, g: 43, b: 69 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    // Alpha is parsed and dropped: a translucent fill composites against an
    // unknown backdrop, so there is no honest luminance to compute.
    expect(parseColor("#A62B4580")).toEqual({ r: 166, g: 43, b: 69 });
    expect(parseColor("rgb(166, 43, 69)")).toEqual({ r: 166, g: 43, b: 69 });
    expect(parseColor("rgba(166 43 69 / 0.5)")).toEqual({ r: 166, g: 43, b: 69 });
  });

  it("returns null for anything that would need a browser to resolve", () => {
    // Resolving these would make the answer differ between the server
    // render and the client's — the exact asymmetry that has caused
    // hydration bugs here before.
    for (const value of ["", "   ", "oklch(0.7 0.1 20)", "rebeccapurple", "var(--primary)", "#12345", "#ab"]) {
      expect(parseColor(value), value).toBeNull();
    }
    expect(parseColor("rgb(300, 0, 0)")).toBeNull();
  });
});

describe("relativeLuminance / contrastRatio", () => {
  it("matches the WCAG reference points", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    // The definitional extreme: black on white is 21:1.
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 4);
    expect(contrastRatio({ r: 18, g: 52, b: 86 }, { r: 18, g: 52, b: 86 })).toBeCloseTo(1, 6);
  });
});

describe("readableInkOn", () => {
  it("puts cream ink on the demo's deep maroon", () => {
    expect(readableInkOn("#A62B45")).toBe(INK_ON_DARK);
  });

  it("flips to dark ink on a pale theme, which is the case that would otherwise be invisible", () => {
    // The whole reason this module exists: a couple is free to pick a
    // blush or a champagne as their primary colour, and the information
    // cards fill themselves with it.
    for (const pale of ["#F6D9DF", "#FBF7F2", "#ffffff", "#E8DCC8"]) {
      expect(readableInkOn(pale), pale).toBe(INK_ON_LIGHT);
    }
  });

  it("never returns ink that fails WCAG AA for large text on the colour it was asked about", () => {
    // 3:1 is the AA threshold for large text, which is what these cards
    // set — headings and a date block, nothing at body size.
    const themes = ["#A62B45", "#2F4A3F", "#1B1B22", "#D9A3AC", "#F6D9DF", "#C9A227", "#7A5C3E"];
    for (const theme of themes) {
      const ink = parseColor(readableInkOn(theme))!;
      expect(contrastRatio(parseColor(theme)!, ink), theme).toBeGreaterThanOrEqual(3);
    }
  });

  it("falls back to cream for a colour it cannot read, matching the behaviour that predates it", () => {
    expect(readableInkOn("oklch(0.7 0.1 20)")).toBe(INK_ON_DARK);
    expect(readableInkOn("")).toBe(INK_ON_DARK);
  });
});
