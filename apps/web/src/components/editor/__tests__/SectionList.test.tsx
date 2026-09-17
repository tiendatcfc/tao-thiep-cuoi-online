// @vitest-environment jsdom
import { KeyboardSensor, PointerSensor } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { SECTION_LIST_SENSOR_DESCRIPTORS, SectionList } from "../SectionList";

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

function sectionsSortedByOrder() {
  return useEditorStore
    .getState()
    .document.sections.slice()
    .sort((a, b) => a.order - b.order);
}

beforeEach(() => {
  resetStore();
});

describe("SectionList rows", () => {
  it("renders each section with its Vietnamese name, sorted by order", () => {
    render(<SectionList />);
    const rows = screen.getAllByRole("listitem");
    const expected = sectionsSortedByOrder();
    expect(rows).toHaveLength(expected.length);
    // createDefaultDocument's first two sections are cover, couple.
    expect(rows[0].textContent).toContain("Trang bìa");
    expect(rows[1].textContent).toContain("Cô dâu chú rể");
  });

  it("every row has a drag handle labeled for keyboard/pointer reordering", () => {
    render(<SectionList />);
    const handles = screen.getAllByRole("button", { name: "Kéo để sắp xếp" });
    expect(handles).toHaveLength(sectionsSortedByOrder().length);
  });

  it("clicking a row selects that section in the store", () => {
    render(<SectionList />);
    const coverId = sectionsSortedByOrder().find((s) => s.type === "cover")?.id;

    fireEvent.click(screen.getByText("Trang bìa"));

    expect(useEditorStore.getState().selectedSectionId).toBe(coverId);
  });

  it("does not select the row when the drag handle is clicked", () => {
    render(<SectionList />);
    const row = screen.getByText("Trang bìa").closest("li")!;

    fireEvent.click(within(row).getByRole("button", { name: "Kéo để sắp xếp" }));

    expect(useEditorStore.getState().selectedSectionId).toBeNull();
  });
});

describe("SectionList visibility toggle", () => {
  it("hides a visible section and flips the button's label; toggling again re-shows it", () => {
    render(<SectionList />);
    const coverId = sectionsSortedByOrder().find((s) => s.type === "cover")?.id;
    const row = screen.getByText("Trang bìa").closest("li")!;

    const hideButton = within(row).getByRole("button", { name: "Ẩn mục" });
    fireEvent.click(hideButton);

    expect(useEditorStore.getState().document.sections.find((s) => s.id === coverId)?.visible).toBe(false);
    expect(within(row).getByRole("button", { name: "Hiện mục" })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Hiện mục" }));
    expect(useEditorStore.getState().document.sections.find((s) => s.id === coverId)?.visible).toBe(true);
  });

  it("does not select the row when the eye toggle is clicked", () => {
    render(<SectionList />);
    const row = screen.getByText("Trang bìa").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Ẩn mục" }));
    expect(useEditorStore.getState().selectedSectionId).toBeNull();
  });
});

describe("SectionList delete", () => {
  it("confirms before removing, and does nothing when the user cancels", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SectionList />);
    const before = useEditorStore.getState().document.sections.length;
    const row = screen.getByText("Trang bìa").closest("li")!;

    fireEvent.click(within(row).getByRole("button", { name: "Xoá mục" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(useEditorStore.getState().document.sections).toHaveLength(before);
    confirmSpy.mockRestore();
  });

  it("removes the section when the user confirms", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SectionList />);
    const coverId = sectionsSortedByOrder().find((s) => s.type === "cover")?.id;
    const before = useEditorStore.getState().document.sections.length;
    const row = screen.getByText("Trang bìa").closest("li")!;

    fireEvent.click(within(row).getByRole("button", { name: "Xoá mục" }));

    expect(useEditorStore.getState().document.sections).toHaveLength(before - 1);
    expect(useEditorStore.getState().document.sections.some((s) => s.id === coverId)).toBe(false);
    confirmSpy.mockRestore();
  });
});

describe("SectionList add control", () => {
  it("offers only types not yet present, plus text/events which allow duplicates", () => {
    render(<SectionList />);
    const addGroup = screen.getByRole("group", { name: "Thêm mục" });

    // Not present in createDefaultDocument -> offered.
    expect(within(addGroup).getByRole("button", { name: "Câu chuyện tình yêu" })).toBeInTheDocument();
    expect(within(addGroup).getByRole("button", { name: "Video" })).toBeInTheDocument();
    expect(within(addGroup).getByRole("button", { name: "Văn bản" })).toBeInTheDocument();
    // Already present but duplicates allowed -> still offered.
    expect(within(addGroup).getByRole("button", { name: "Sự kiện" })).toBeInTheDocument();
    // Already present, single-instance -> not offered.
    // Task 4: a second questionnaire beside the RSVP (meal choice, shuttle
    // sign-up) is a real need, so `form` joined text/events as duplicable.
    expect(within(addGroup).getByRole("button", { name: "Biểu mẫu" })).toBeInTheDocument();

    expect(within(addGroup).queryByRole("button", { name: "Trang bìa" })).not.toBeInTheDocument();
    expect(within(addGroup).queryByRole("button", { name: "Hộp mừng cưới" })).not.toBeInTheDocument();
  });

  it("adds a new section of the chosen type and selects it", () => {
    render(<SectionList />);
    const addGroup = screen.getByRole("group", { name: "Thêm mục" });
    const before = useEditorStore.getState().document.sections.length;

    fireEvent.click(within(addGroup).getByRole("button", { name: "Văn bản" }));

    const after = useEditorStore.getState().document.sections;
    expect(after).toHaveLength(before + 1);
    const added = after.find((s) => s.type === "text");
    expect(added).toBeDefined();
    expect(useEditorStore.getState().selectedSectionId).toBe(added?.id);
  });
});

describe("SectionList dnd-kit sensor configuration", () => {
  // A real pointer/keyboard-driven drag through dnd-kit is impractical to
  // simulate faithfully in jsdom (see the store-level `reorderSections`
  // tests for the actual reorder-logic coverage). This instead asserts,
  // against the exact descriptor array the component feeds into
  // `useSensors`, that keyboard support is wired up per dnd-kit's
  // documented accessible-sortable-list pattern. End-to-end keyboard
  // drag-and-drop remains unverified by an automated test.
  it("configures a KeyboardSensor with sortableKeyboardCoordinates, and a PointerSensor", () => {
    const isKeyboardDescriptor = (
      d: (typeof SECTION_LIST_SENSOR_DESCRIPTORS)[number],
    ): d is { sensor: typeof KeyboardSensor; options: { coordinateGetter: typeof sortableKeyboardCoordinates } } =>
      d.sensor === KeyboardSensor;

    const keyboard = SECTION_LIST_SENSOR_DESCRIPTORS.find(isKeyboardDescriptor);
    expect(keyboard?.options.coordinateGetter).toBe(sortableKeyboardCoordinates);
    expect(SECTION_LIST_SENSOR_DESCRIPTORS.some((d) => d.sensor === PointerSensor)).toBe(true);
  });
});
