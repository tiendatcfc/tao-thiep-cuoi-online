// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { EditorPanel } from "../EditorPanel";

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe("EditorPanel", () => {
  it("shows the document-level tabs (Giao diện / Nhạc nền / Hiệu ứng mở màn) when nothing is selected", () => {
    render(<EditorPanel />);
    expect(screen.getByRole("tab", { name: "Giao diện" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Nhạc nền" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Hiệu ứng mở màn" })).toBeInTheDocument();
    // Defaults to "Giao diện" -> ThemePanel's color fields are visible.
    expect(screen.getByLabelText("Màu chủ đạo")).toBeInTheDocument();
  });

  it("renders the matching panel for a selected section, with its Vietnamese type label as a heading", () => {
    const coverId = useEditorStore.getState().document.sections.find((s) => s.type === "cover")!.id;
    useEditorStore.setState({ selectedSectionId: coverId });
    render(<EditorPanel />);

    expect(screen.getByRole("heading", { name: "Trang bìa" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tên chú rể")).toBeInTheDocument();
  });

  it("falls back to the document-level tabs when the selected id no longer exists (e.g. just deleted)", () => {
    useEditorStore.setState({ selectedSectionId: "does-not-exist" });
    render(<EditorPanel />);
    expect(screen.getByRole("tab", { name: "Giao diện" })).toBeInTheDocument();
  });

  it("catches a panel that throws while rendering instead of blanking the whole pane", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Corrupt the selected section's props so CoverPanel's destructuring throws.
    const document = createDefaultDocument();
    const cover = document.sections.find((s) => s.type === "cover")!;
    (cover as unknown as { props: unknown }).props = undefined;
    useEditorStore.setState({ document, selectedSectionId: cover.id });

    render(<EditorPanel />);

    expect(screen.getByText("Không thể hiển thị bảng chỉnh sửa cho mục này.")).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});
