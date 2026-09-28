// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { CoverPanel } from "../CoverPanel";

function coverSection(): Extract<Section, { type: "cover" }> {
  return createSection("cover") as Extract<Section, { type: "cover" }>;
}

beforeEach(() => {
  useEditorStore.setState({
    document: { version: 1 } as never,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("CoverPanel", () => {
  it("renders every CoverProps field with its current value", () => {
    const section = coverSection();
    section.props = { ...section.props, groomName: "Ngọc Hải", brideName: "Hồng Thắm", tagline: "Save the date" };
    render(<CoverPanel section={section} />);

    expect(screen.getByLabelText("Tên chú rể")).toHaveValue("Ngọc Hải");
    expect(screen.getByLabelText("Tên cô dâu")).toHaveValue("Hồng Thắm");
    expect(screen.getByLabelText("Khẩu hiệu")).toHaveValue("Save the date");
  });

  it("edits go through updateSectionProps, not a direct document mutation", () => {
    const section = coverSection();
    useEditorStore.setState({
      document: { version: 1, sections: [section] } as never,
    });
    render(<CoverPanel section={section} />);

    fireEvent.change(screen.getByLabelText("Tên chú rể"), { target: { value: "Văn A" } });
    fireEvent.blur(screen.getByLabelText("Tên chú rể"));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "cover" }>;
    expect(updated.props.groomName).toBe("Văn A");
  });
});
