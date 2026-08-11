import { createDefaultDocument, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { describe, expect, it } from "vitest";
import { buildInvitationDocumentFromTemplate, deriveCoverNames, toInvitationSummary } from "../invitations";

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

describe("buildInvitationDocumentFromTemplate", () => {
  it("returns null when the input fails schema validation", () => {
    expect(buildInvitationDocumentFromTemplate({ not: "a valid document" })).toBeNull();
    expect(buildInvitationDocumentFromTemplate(null)).toBeNull();
  });

  it("returns a value that still passes InvitationDocumentSchema", () => {
    const input = createDefaultDocument();
    const result = buildInvitationDocumentFromTemplate(input);
    expect(() => InvitationDocumentSchema.parse(result)).not.toThrow();
  });

  it("returns an object that is NOT the same reference as the input", () => {
    const input = createDefaultDocument();
    const result = buildInvitationDocumentFromTemplate(input);
    expect(result).not.toBe(input);
  });

  it("does not share the nested `theme` object with the input — mutating the result leaves the input untouched", () => {
    const input = createDefaultDocument();
    const result = buildInvitationDocumentFromTemplate(input)!;

    result.theme.primary = "#MUTATED";

    expect(input.theme.primary).not.toBe("#MUTATED");
  });

  it("does not share the nested `sections` array (or its elements) with the input — mutating a section's props on the result leaves the input untouched", () => {
    const input = createDefaultDocument();
    const result = buildInvitationDocumentFromTemplate(input)!;

    expect(result.sections).not.toBe(input.sections);
    const resultCover = result.sections.find((s): s is Extract<Section, { type: "cover" }> => s.type === "cover");
    const inputCover = input.sections.find((s): s is Extract<Section, { type: "cover" }> => s.type === "cover");
    if (!resultCover || !inputCover) throw new Error("fixture invalid: no cover section");

    resultCover.props.groomName = "MUTATED";

    expect(inputCover.props.groomName).not.toBe("MUTATED");
  });
});

describe("toInvitationSummary", () => {
  it("maps id/slug/status/viewCount through unchanged, stringifies dates, and derives coverNames", () => {
    const document = documentWithNames("Minh", "Lan");
    const updatedAt = new Date("2026-08-09T10:00:00.000Z");
    const publishedAt = new Date("2026-08-01T00:00:00.000Z");

    const summary = toInvitationSummary({
      id: "inv-1",
      slug: "minh-lan",
      status: "published",
      publishedAt,
      viewCount: 7,
      updatedAt,
      document,
    });

    expect(summary).toEqual({
      id: "inv-1",
      slug: "minh-lan",
      status: "published",
      publishedAt: "2026-08-01T00:00:00.000Z",
      viewCount: 7,
      updatedAt: "2026-08-09T10:00:00.000Z",
      coverNames: "Minh & Lan",
    });
  });

  it("passes through publishedAt: null as-is (draft invitations)", () => {
    const summary = toInvitationSummary({
      id: "inv-2",
      slug: "nhap-abc",
      status: "draft",
      publishedAt: null,
      viewCount: 0,
      updatedAt: new Date("2026-08-10T10:00:00.000Z"),
      document: createDefaultDocument(),
    });

    expect(summary.publishedAt).toBeNull();
  });
});
