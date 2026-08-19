// @vitest-environment jsdom
import { createDefaultDocument, createSection, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { AnimationControl, clampDurationMs } from "../AnimationControl";
import { EditorPanel } from "../EditorPanel";

function resetStore(document = createDefaultDocument()) {
  useEditorStore.setState({
    document,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe("clampDurationMs", () => {
  it("clamps below the minimum up to 100", () => {
    expect(clampDurationMs(50)).toBe(100);
  });

  it("clamps above the maximum down to 3000", () => {
    expect(clampDurationMs(5000)).toBe(3000);
  });

  it("rounds a fractional value to the nearest integer", () => {
    expect(clampDurationMs(642.7)).toBe(643);
  });

  it("falls back to 600 for a non-finite value", () => {
    expect(clampDurationMs(Number.NaN)).toBe(600);
    expect(clampDurationMs(Number.POSITIVE_INFINITY)).toBe(600);
  });
});

describe("AnimationControl", () => {
  it("changes the preset through the store and the document stays parseable", () => {
    const document = createDefaultDocument();
    const section = document.sections.find((s) => s.type === "cover") as Section;
    resetStore(document);
    render(<AnimationControl section={section} />);

    fireEvent.change(screen.getByLabelText("Kiểu hiệu ứng"), { target: { value: "slide-up" } });

    const updated = useEditorStore.getState().document.sections.find((s) => s.id === section.id);
    expect(updated?.animation.preset).toBe("slide-up");
    expect(() => InvitationDocumentSchema.parse(useEditorStore.getState().document)).not.toThrow();
  });

  it("clamps a through-the-field durationMs edit into range and rounds it to an integer", () => {
    const document = createDefaultDocument();
    const section = document.sections.find((s) => s.type === "cover") as Section;
    resetStore(document);
    render(<AnimationControl section={section} />);

    const durationInput = screen.getByLabelText("Thời lượng (ms)");
    fireEvent.change(durationInput, { target: { value: "642.7" } });
    fireEvent.blur(durationInput);

    const updated = useEditorStore.getState().document.sections.find((s) => s.id === section.id);
    expect(updated?.animation.durationMs).toBe(643);
    expect(() => InvitationDocumentSchema.parse(useEditorStore.getState().document)).not.toThrow();
  });

  it("hides the duration field when preset is 'none'", () => {
    const document = createDefaultDocument();
    const section = document.sections.find((s) => s.type === "cover") as Section;
    section.animation = { preset: "none", durationMs: 600 };
    resetStore(document);
    render(<AnimationControl section={section} />);

    expect(screen.queryByLabelText("Thời lượng (ms)")).not.toBeInTheDocument();
  });

  it("shows the control for every section type via EditorPanel", () => {
    const document = createDefaultDocument();
    const album = document.sections.find((s) => s.type === "album");
    if (!album) throw new Error("Fixture invalid: expected album section");
    resetStore(document);
    useEditorStore.setState({ selectedSectionId: album.id });

    render(<EditorPanel />);

    expect(screen.getByText("Hiệu ứng xuất hiện")).toBeInTheDocument();
    // The album panel's own field is still rendered alongside it.
    expect(screen.getByLabelText("Bố cục")).toBeInTheDocument();
  });

  it("shows the control for a section type not seeded in the default document (e.g. video)", () => {
    const document = createDefaultDocument();
    const video = createSection("video");
    video.order = document.sections.length;
    document.sections.push(video);
    resetStore(document);
    useEditorStore.setState({ selectedSectionId: video.id });

    render(<EditorPanel />);

    expect(screen.getByText("Hiệu ứng xuất hiện")).toBeInTheDocument();
  });
});
