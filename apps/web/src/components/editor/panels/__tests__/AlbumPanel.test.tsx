// @vitest-environment jsdom
import { createSection, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { AlbumPanel } from "../AlbumPanel";

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
