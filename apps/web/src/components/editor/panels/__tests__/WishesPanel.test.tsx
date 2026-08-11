// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { WishesPanel } from "../WishesPanel";

function wishesSection(): Extract<Section, { type: "wishes" }> {
  return createSection("wishes") as Extract<Section, { type: "wishes" }>;
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

describe("WishesPanel", () => {
  it("toggles requireApproval", () => {
    const section = wishesSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<WishesPanel section={section} />);

    fireEvent.click(screen.getByRole("switch", { name: "Duyệt lời chúc trước khi hiển thị" }));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "wishes" }>;
    expect(updated.props.requireApproval).toBe(true);
  });
});
