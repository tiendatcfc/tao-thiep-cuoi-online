import { createDefaultDocument, type Section } from "@hpwd/schema";
import { describe, expect, it } from "vitest";
import { deriveCoverNames } from "../invitations";

function documentWithNames(groomName: string, brideName: string) {
  const document = createDefaultDocument();
  const cover = document.sections.find((s): s is Extract<Section, { type: "cover" }> => s.type === "cover");
  if (!cover) throw new Error("fixture invalid: no cover section");
  cover.props.groomName = groomName;
  cover.props.brideName = brideName;
  return document;
}

describe("deriveCoverNames", () => {
  it("joins groom & bride names with '&' when both are set", () => {
    expect(deriveCoverNames(documentWithNames("Minh", "Lan"))).toBe("Minh & Lan");
  });

  it("returns just the groom's name when the bride's is empty", () => {
    expect(deriveCoverNames(documentWithNames("Minh", ""))).toBe("Minh");
  });

  it("returns just the bride's name when the groom's is empty", () => {
    expect(deriveCoverNames(documentWithNames("", "Lan"))).toBe("Lan");
  });

  it("falls back to 'Thiệp chưa đặt tên' when both names are empty", () => {
    expect(deriveCoverNames(documentWithNames("", ""))).toBe("Thiệp chưa đặt tên");
  });

  it("falls back to 'Thiệp chưa đặt tên' when the document fails schema validation", () => {
    expect(deriveCoverNames({ not: "a valid document" })).toBe("Thiệp chưa đặt tên");
  });

  it("falls back to 'Thiệp chưa đặt tên' for null/undefined input", () => {
    expect(deriveCoverNames(null)).toBe("Thiệp chưa đặt tên");
    expect(deriveCoverNames(undefined)).toBe("Thiệp chưa đặt tên");
  });

  it("trims whitespace-only names as if empty", () => {
    expect(deriveCoverNames(documentWithNames("   ", "  "))).toBe("Thiệp chưa đặt tên");
  });
});
