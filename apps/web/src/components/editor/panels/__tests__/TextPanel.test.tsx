// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { TextPanel } from "../TextPanel";

function textSection(): Extract<Section, { type: "text" }> {
  return createSection("text") as Extract<Section, { type: "text" }>;
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

describe("TextPanel", () => {
  it("edits the raw html prop via a textarea, committed on blur", () => {
    const section = textSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<TextPanel section={section} />);

    const textarea = screen.getByLabelText("Nội dung");
    fireEvent.change(textarea, { target: { value: "<p>Xin chào</p>" } });
    fireEvent.blur(textarea);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "text" }>;
    expect(updated.props.html).toBe("<p>Xin chào</p>");
  });
});
