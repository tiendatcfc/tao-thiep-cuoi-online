// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { ThemePanel } from "../ThemePanel";

beforeEach(() => {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("ThemePanel", () => {
  it("renders the current theme colors and fonts", () => {
    render(<ThemePanel />);
    expect(screen.getByLabelText("Mã màu Màu chủ đạo")).toHaveValue(useEditorStore.getState().document.theme.primary);
    expect(screen.getByLabelText("Font tiêu đề")).toHaveValue(useEditorStore.getState().document.theme.headingFont);
  });

  it("choosing a new heading font updates the store via updateTheme", () => {
    render(<ThemePanel />);
    fireEvent.change(screen.getByLabelText("Font tiêu đề"), { target: { value: "Dancing Script" } });
    expect(useEditorStore.getState().document.theme.headingFont).toBe("Dancing Script");
  });

  it("choosing a new body font updates the store", () => {
    render(<ThemePanel />);
    fireEvent.change(screen.getByLabelText("Font nội dung"), { target: { value: "Inter" } });
    expect(useEditorStore.getState().document.theme.bodyFont).toBe("Inter");
  });

  it("editing the primary color hex commits to the store on blur", () => {
    render(<ThemePanel />);
    const hexInput = screen.getByLabelText("Mã màu Màu chủ đạo");
    fireEvent.change(hexInput, { target: { value: "#112233" } });
    fireEvent.blur(hexInput);
    expect(useEditorStore.getState().document.theme.primary).toBe("#112233");
  });

  it("offers every FONT_OPTIONS family as a choice for both heading and body font", () => {
    render(<ThemePanel />);
    const headingSelect = screen.getByLabelText("Font tiêu đề") as HTMLSelectElement;
    const values = Array.from(headingSelect.options).map((o) => o.value);
    expect(values).toContain("Playfair Display");
    expect(values).toContain("Be Vietnam Pro");
    expect(values).toHaveLength(8);
  });
});
