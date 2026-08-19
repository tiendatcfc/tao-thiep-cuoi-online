// @vitest-environment jsdom
import { createSection, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { AlbumPanel, clampPositiveInt } from "../AlbumPanel";

function albumSection(): Extract<Section, { type: "album" }> {
  return createSection("album") as Extract<Section, { type: "album" }>;
}

beforeEach(() => {
  useEditorStore.setState({
    document: { version: 1, sections: [] } as never,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clampPositiveInt", () => {
  it("passes a normal positive integer through unchanged", () => {
    expect(clampPositiveInt(1200)).toBe(1200);
  });

  it("floors 0 and negative numbers up to 1 (AlbumImageSchema requires .int().positive())", () => {
    expect(clampPositiveInt(0)).toBe(1);
    expect(clampPositiveInt(-50)).toBe(1);
  });

  it("rounds a fractional value to the nearest integer", () => {
    expect(clampPositiveInt(799.6)).toBe(800);
  });

  it("returns 1 for non-finite input instead of propagating NaN into the document (B1-class autosave death otherwise)", () => {
    expect(clampPositiveInt(Number.NaN)).toBe(1);
    expect(clampPositiveInt(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampPositiveInt(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("AlbumPanel", () => {
  it("changes the layout via the select field", () => {
    const section = albumSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<AlbumPanel section={section} />);

    fireEvent.change(screen.getByLabelText("Bố cục"), { target: { value: "carousel" } });

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "album" }>;
    expect(updated.props.layout).toBe("carousel");
  });

  it("adds a placeholder image that already satisfies AlbumImageSchema's positive-int width/height", () => {
    const section = albumSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<AlbumPanel section={section} />);

    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "album" }>;
    expect(updated.props.images).toHaveLength(1);
    const image = updated.props.images[0];
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(Number.isInteger(image.width)).toBe(true);
    expect(Number.isInteger(image.height)).toBe(true);
    expect(image.blurDataUrl.length).toBeGreaterThan(0);

    // The whole document (with this album section swapped in) must still
    // pass the real schema — not just "the numbers look positive".
    const doc = { ...InvitationDocumentSchemaFixture(), sections: [updated] };
    expect(() => InvitationDocumentSchema.parse(doc)).not.toThrow();
  });

  it("stores the real blurDataUrl an upload returns (not the transparent-pixel placeholder), and stays schema-valid", async () => {
    const section = albumSection();
    section.props.images = [{ url: "https://cdn.test/old.jpg", width: 800, height: 600, blurDataUrl: "data:," }];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });

    const realLookingBlur = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        url: "https://cdn.test/new-800.webp",
        width: 1200,
        height: 800,
        blurDataUrl: realLookingBlur,
        assetId: "new-asset",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AlbumPanel section={section} />);
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Ảnh"), { target: { files: [file] } });

    await waitFor(() => {
      const updated = useEditorStore
        .getState()
        .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "album" }>;
      expect(updated.props.images[0].blurDataUrl).toBe(realLookingBlur);
    });

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "album" }>;
    expect(updated.props.images[0]).toEqual({
      url: "https://cdn.test/new-800.webp",
      width: 1200,
      height: 800,
      blurDataUrl: realLookingBlur,
    });

    const doc = { ...InvitationDocumentSchemaFixture(), sections: [updated] };
    expect(() => InvitationDocumentSchema.parse(doc)).not.toThrow();
  });

  it("manually editing width/height clamps to a minimum of 1", () => {
    const section = albumSection();
    section.props.images = [{ url: "https://cdn.test/a.jpg", width: 800, height: 600, blurDataUrl: "data:," }];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<AlbumPanel section={section} />);

    const widthInput = screen.getByLabelText("Rộng (px)");
    fireEvent.change(widthInput, { target: { value: "-10" } });
    fireEvent.blur(widthInput);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "album" }>;
    expect(updated.props.images[0].width).toBe(1);
  });
});

function InvitationDocumentSchemaFixture() {
  return {
    version: 1 as const,
    theme: {
      primary: "#000000",
      secondary: "#ffffff",
      background: "#ffffff",
      headingFont: "Inter",
      bodyFont: "Inter",
      customFonts: [],
    },
    music: { source: null, url: null, trackId: null, playAfterOpen: true },
    opening: { effect: "none" as const, particles: null, monogram: "", showGuestName: true },
    sections: [],
  };
}
