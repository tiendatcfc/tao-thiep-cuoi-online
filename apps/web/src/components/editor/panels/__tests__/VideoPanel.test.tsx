// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { VideoPanel } from "../VideoPanel";

function videoSection(): Extract<Section, { type: "video" }> {
  return createSection("video") as Extract<Section, { type: "video" }>;
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

describe("VideoPanel", () => {
  it("edits youtubeId and caption through updateSectionProps", () => {
    const section = videoSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<VideoPanel section={section} />);

    const idInput = screen.getByLabelText("Video YouTube");
    fireEvent.change(idInput, { target: { value: "dQw4w9WgXcQ" } });
    fireEvent.blur(idInput);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "video" }>;
    expect(updated.props.youtubeId).toBe("dQw4w9WgXcQ");
  });

  it("normalizes a pasted URL to the bare id in the store", () => {
    const section = videoSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<VideoPanel section={section} />);

    const idInput = screen.getByLabelText("Video YouTube");
    fireEvent.change(idInput, { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.blur(idInput);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "video" }>;
    expect(updated.props.youtubeId).toBe("dQw4w9WgXcQ");
  });

  it("stores unparseable input verbatim and shows a warning", () => {
    const section = videoSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    const { rerender } = render(<VideoPanel section={section} />);

    const idInput = screen.getByLabelText("Video YouTube");
    fireEvent.change(idInput, { target: { value: "not a video" } });
    fireEvent.blur(idInput);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "video" }>;
    expect(updated.props.youtubeId).toBe("not a video");

    // The real editor re-renders the panel with the freshly patched section
    // (EditorPanel subscribes to the store and passes the current section
    // down — see EditorPanel.tsx); mirror that here since this test renders
    // VideoPanel in isolation with a static section prop.
    rerender(<VideoPanel section={updated} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows no warning for a valid id", () => {
    const section = { ...videoSection(), props: { youtubeId: "dQw4w9WgXcQ", caption: "" } };
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<VideoPanel section={section} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
