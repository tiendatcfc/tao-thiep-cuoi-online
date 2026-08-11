// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { FormPanel } from "../FormPanel";

function formSection(): Extract<Section, { type: "form" }> {
  const base = createSection("form") as Extract<Section, { type: "form" }>;
  base.props.fields = [
    { id: "f1", type: "text", label: "Tên", required: true, options: [], placeholder: "" },
  ];
  return base;
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

describe("FormPanel", () => {
  it("shows the read-only RSVP note only when isRsvp is true", () => {
    const rsvp = formSection();
    rsvp.props.isRsvp = true;
    const { rerender } = render(<FormPanel section={rsvp} />);
    expect(screen.getByText(/Đây là biểu mẫu xác nhận tham dự/)).toBeInTheDocument();

    const notRsvp = formSection();
    notRsvp.props.isRsvp = false;
    rerender(<FormPanel section={notRsvp} />);
    expect(screen.queryByText(/Đây là biểu mẫu xác nhận tham dự/)).not.toBeInTheDocument();
  });

  it("adding a select-type field shows an options ListField and a warning when it has zero options", () => {
    const section = formSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    // `EditorPanel` (Task 16's wiring) always re-renders a panel with a
    // fresh `section` prop straight from the store on every change — a raw
    // `render(<FormPanel section={section} />)` with a static object
    // wouldn't pick up a store update on its own, so this `rerender` models
    // that real data flow rather than testing an artifact of a stale prop.
    const { rerender } = render(<FormPanel section={section} />);

    const row = screen.getAllByRole("listitem")[0];
    fireEvent.change(within(row).getByLabelText("Loại câu hỏi"), { target: { value: "select" } });

    const updatedSection = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "form" }>;
    rerender(<FormPanel section={updatedSection} />);

    const updatedRow = screen.getAllByRole("listitem")[0];
    expect(within(updatedRow).getByText(/Cần thêm ít nhất 1 lựa chọn/)).toBeInTheDocument();
  });

  it("adding an option to a select field's options list clears the warning and updates the store", () => {
    const section = formSection();
    section.props.fields = [{ id: "f1", type: "select", label: "Bạn có đến không?", required: true, options: [] }];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<FormPanel section={section} />);

    const questionRow = screen.getAllByRole("listitem")[0];
    // "Thêm" appears both for the outer question list and the inner options
    // list — the inner one, scoped inside the question row, is what adds an
    // option.
    const addButtons = within(questionRow).getAllByRole("button", { name: "Thêm" });
    fireEvent.click(addButtons[addButtons.length - 1]);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "form" }>;
    expect(updated.props.fields[0].options).toEqual([""]);
  });

  it("edits submitLabel", () => {
    const section = formSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<FormPanel section={section} />);

    const input = screen.getByLabelText("Nút gửi");
    fireEvent.change(input, { target: { value: "Xác nhận" } });
    fireEvent.blur(input);

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "form" }>;
    expect(updated.props.submitLabel).toBe("Xác nhận");
  });
});
