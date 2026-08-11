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

    const idInput = screen.getByLabelText("Mã video YouTube");
    fireEvent.change(idInput, { target: { value: "dQw4w9WgXcQ" } });
    fireEvent.blur(idInput);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "video" }>;
    expect(updated.props.youtubeId).toBe("dQw4w9WgXcQ");
  });
});
