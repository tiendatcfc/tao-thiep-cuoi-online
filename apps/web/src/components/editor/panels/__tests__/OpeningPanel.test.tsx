// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { OpeningPanel } from "../OpeningPanel";

beforeEach(() => {
  const document = createDefaultDocument();
  document.opening = { effect: "envelope", particles: "petals", monogram: "", showGuestName: true };
  useEditorStore.setState({
    document,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("OpeningPanel", () => {
  it("renders 4 illustrated effect choices, marking the current one selected", () => {
    render(<OpeningPanel />);
    const group = screen.getByRole("radiogroup", { name: "Hiệu ứng mở màn" });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /Phong bì/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Rèm kéo/ })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking a different effect updates the store via updateOpening", () => {
    render(<OpeningPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /Mờ dần/ }));
    expect(useEditorStore.getState().document.opening.effect).toBe("fade");
  });

  it("selecting 'Không' for particles stores null, not the string 'none'", () => {
    render(<OpeningPanel />);
    fireEvent.change(screen.getByLabelText("Hiệu ứng hạt"), { target: { value: "none" } });
    expect(useEditorStore.getState().document.opening.particles).toBeNull();
  });

  it("selecting a particle kind stores it", () => {
    render(<OpeningPanel />);
    fireEvent.change(screen.getByLabelText("Hiệu ứng hạt"), { target: { value: "confetti" } });
    expect(useEditorStore.getState().document.opening.particles).toBe("confetti");
  });

  it("truncates the monogram to 4 characters", () => {
    render(<OpeningPanel />);
    const input = screen.getByLabelText("Monogram");
    fireEvent.change(input, { target: { value: "MK & TH" } });
    expect(input).toHaveValue("MK &");
  });

  it("toggles showGuestName", () => {
    render(<OpeningPanel />);
    fireEvent.click(screen.getByRole("switch", { name: "Hiện tên khách mời" }));
    expect(useEditorStore.getState().document.opening.showGuestName).toBe(false);
  });
});
