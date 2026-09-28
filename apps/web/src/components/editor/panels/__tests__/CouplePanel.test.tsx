// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { CouplePanel } from "../CouplePanel";

function coupleSection(): Extract<Section, { type: "couple" }> {
  return createSection("couple") as Extract<Section, { type: "couple" }>;
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

describe("CouplePanel", () => {
  it("renders separate, labeled groups for groom and bride", () => {
    const section = coupleSection();
    section.props.groom.name = "Ngọc Hải";
    section.props.bride.name = "Hồng Thắm";
    render(<CouplePanel section={section} />);

    const groomGroup = screen.getByRole("group", { name: "Chú rể" });
    const brideGroup = screen.getByRole("group", { name: "Cô dâu" });
    expect(within(groomGroup).getByLabelText("Họ và tên")).toHaveValue("Ngọc Hải");
    expect(within(brideGroup).getByLabelText("Họ và tên")).toHaveValue("Hồng Thắm");
  });

  it("updates only the bride's name when edited, leaving the groom untouched", () => {
    const section = coupleSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<CouplePanel section={section} />);

    const brideGroup = screen.getByRole("group", { name: "Cô dâu" });
    fireEvent.change(within(brideGroup).getByLabelText("Họ và tên"), { target: { value: "Lan Anh" } });
    fireEvent.blur(within(brideGroup).getByLabelText("Họ và tên"));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "couple" }>;
    expect(updated.props.bride.name).toBe("Lan Anh");
    expect(updated.props.groom.name).toBe(section.props.groom.name);
  });
});
