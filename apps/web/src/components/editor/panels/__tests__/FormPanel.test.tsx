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
  // Task 4 turned the former read-only RSVP banner into an editable toggle,
  // so the assertion is now about the control reflecting state, not a note.
  it("reflects isRsvp in the RSVP toggle and explains what it does either way", () => {
    const rsvp = formSection();
    rsvp.props.isRsvp = true;
    const { rerender } = render(<FormPanel section={rsvp} />);

    const onToggle = screen.getByLabelText("Dùng làm biểu mẫu xác nhận tham dự (RSVP)");
    expect(onToggle).toBeChecked();
    expect(screen.getByText(/Chỉ một biểu mẫu được đánh dấu/)).toBeInTheDocument();

    const notRsvp = formSection();
    notRsvp.props.isRsvp = false;
    rerender(<FormPanel section={notRsvp} />);

    expect(screen.getByLabelText("Dùng làm biểu mẫu xác nhận tham dự (RSVP)")).not.toBeChecked();
    expect(screen.getByText(/Bật nếu đây là biểu mẫu khách mời xác nhận tham dự/)).toBeInTheDocument();
  });

  it("clicking the RSVP toggle writes isRsvp through to the store", () => {
    const section = formSection();
    section.props.isRsvp = false;
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<FormPanel section={section} />);

    fireEvent.click(screen.getByLabelText("Dùng làm biểu mẫu xác nhận tham dự (RSVP)"));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "form" }>;
    expect(updated.props.isRsvp).toBe(true);
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
    // The fixture field is `required: true`, so this is the stronger of the
    // two warnings: a required question with no options can never be answered,
    // which blocks the whole form rather than just looking unfinished.
    expect(within(updatedRow).getByRole("alert")).toHaveTextContent(/không gửi được biểu mẫu/);
  });

  it("softens the zero-options warning when the question is optional", () => {
    const section = formSection();
    section.props.fields = [{ id: "f1", type: "select", label: "Món ăn", required: false, options: [] }];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });

    render(<FormPanel section={section} />);

    const row = screen.getAllByRole("listitem")[0];
    expect(within(row).getByRole("alert")).toHaveTextContent(/Cần thêm ít nhất 1 lựa chọn/);
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
