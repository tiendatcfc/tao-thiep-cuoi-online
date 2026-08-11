import { createDefaultDocument, createSection } from "@hpwd/schema";
import { describe, expect, it } from "vitest";
import { findCoverSection } from "../sections";

describe("findCoverSection", () => {
  it("finds the cover section among other sections", () => {
    const { sections } = createDefaultDocument();
    const cover = findCoverSection(sections);
    expect(cover?.type).toBe("cover");
  });

  it("returns null when there's no cover section", () => {
    const other = createSection("gift");
    expect(findCoverSection([other])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findCoverSection([])).toBeNull();
  });
});
