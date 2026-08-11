import { describe, expect, it } from "vitest";
import { FONT_OPTIONS, fontFamilyStack } from "../fonts";

describe("FONT_OPTIONS", () => {
  it("has exactly 8 self-hosted, Vietnamese-subset font pairs", () => {
    expect(FONT_OPTIONS).toHaveLength(8);
  });

  it("every entry has a unique id and family name", () => {
    const ids = FONT_OPTIONS.map((f) => f.id);
    const families = FONT_OPTIONS.map((f) => f.family);
    expect(new Set(ids).size).toBe(FONT_OPTIONS.length);
    expect(new Set(families).size).toBe(FONT_OPTIONS.length);
  });

  it("includes the 8 named families from the task brief", () => {
    const families = FONT_OPTIONS.map((f) => f.family);
    expect(families).toEqual(
      expect.arrayContaining([
        "Playfair Display",
        "Cormorant Garamond",
        "Lora",
        "Be Vietnam Pro",
        "Quicksand",
        "Dancing Script",
        "Merriweather",
        "Inter",
      ]),
    );
  });

  it("every entry declares a non-empty fallback stack and a category", () => {
    for (const font of FONT_OPTIONS) {
      expect(font.fallback.length).toBeGreaterThan(0);
      expect(["serif", "sans", "script"]).toContain(font.category);
    }
  });
});

describe("fontFamilyStack", () => {
  it("builds a quoted family + fallback stack for a known font", () => {
    expect(fontFamilyStack("Playfair Display")).toBe('"Playfair Display", Georgia, \'Times New Roman\', serif');
  });

  it("falls back to a generic sans-serif stack for an unknown font name, without throwing", () => {
    expect(fontFamilyStack("Some Custom Font")).toBe('"Some Custom Font", sans-serif');
  });

  it("never throws or returns an empty string for an empty family name", () => {
    expect(() => fontFamilyStack("")).not.toThrow();
    expect(fontFamilyStack("")).toBe("sans-serif");
  });
});
