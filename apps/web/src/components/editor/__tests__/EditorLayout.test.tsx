// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";

// EditorLayout mounts `useAutosave`, which schedules a `fetch` after the
// document goes dirty. None of these tests mutate the store, so no fetch
// should ever fire — stubbing it just guards against a real network call
// leaking out of the test if that assumption is ever violated.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { EditorLayout } from "../EditorLayout";

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
  fetchMock.mockReset();
});

const baseProps = {
  invitationId: "inv-1",
  slug: "demo",
  initialDocument: createDefaultDocument(),
};

describe("EditorLayout", () => {
  it("seeds the store with the initial document on mount", () => {
    const doc = createDefaultDocument();
    doc.theme.primary = "#TESTVAL";
    render(<EditorLayout {...baseProps} initialDocument={doc} />);
    expect(useEditorStore.getState().document.theme.primary).toBe("#TESTVAL");
  });

  it("shows the placeholder panel text when no section is selected", () => {
    render(<EditorLayout {...baseProps} />);
    expect(screen.getAllByText("Chọn một mục để chỉnh sửa").length).toBeGreaterThan(0);
  });

  it("renders a disabled Xuất bản button titled Sắp có", () => {
    render(<EditorLayout {...baseProps} />);
    const buttons = screen.getAllByRole("button", { name: "Xuất bản" });
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Sắp có");
    }
  });

  it("shows the invitation slug in the header", () => {
    render(<EditorLayout {...baseProps} />);
    expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
  });

  it("renders the mobile tab labels", () => {
    render(<EditorLayout {...baseProps} />);
    expect(screen.getByRole("button", { name: "Mục" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem trước" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chỉnh sửa" })).toBeInTheDocument();
  });

  it("shows 'Đang lưu…' while saving", () => {
    render(<EditorLayout {...baseProps} />);
    act(() => {
      useEditorStore.getState().setSaving(true);
    });
    expect(screen.getAllByText("Đang lưu…").length).toBeGreaterThan(0);
  });

  it("shows 'Đã lưu lúc HH:mm' after a successful save", () => {
    render(<EditorLayout {...baseProps} />);
    const at = new Date(2026, 0, 1, 9, 5).getTime();
    act(() => {
      useEditorStore.getState().markSaved(at);
    });
    expect(screen.getAllByText("Đã lưu lúc 09:05").length).toBeGreaterThan(0);
  });
});
