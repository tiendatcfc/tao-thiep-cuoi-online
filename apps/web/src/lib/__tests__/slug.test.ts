import { describe, expect, it } from "vitest";
import { removeDiacritics, toSlug } from "../slug";

describe("removeDiacritics", () => {
  it("strips combining diacritics and maps đ/Đ to d/D", () => {
    expect(removeDiacritics("ăâđêôơư ẮẰẲẴẶ")).toBe("aadeoou AAAAA");
  });

  it("leaves plain ASCII untouched", () => {
    expect(removeDiacritics("Minh & Ha")).toBe("Minh & Ha");
  });
});

describe("toSlug", () => {
  it("lowercases, strips diacritics, and hyphenates non-alphanumeric runs", () => {
    expect(toSlug("Đám Cưới Minh & Hà!")).toBe("dam-cuoi-minh-ha");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    expect(toSlug("  --Hello   World--  ")).toBe("hello-world");
  });
});
