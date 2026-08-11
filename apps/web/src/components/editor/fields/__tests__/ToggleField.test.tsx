// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleField } from "../ToggleField";

describe("ToggleField", () => {
  it("renders as an accessible switch with the Vietnamese label, reflecting the current value", () => {
    render(<ToggleField label="Duyệt lời chúc trước khi hiển thị" value={false} onChange={vi.fn()} />);
    const toggle = screen.getByRole("switch", { name: "Duyệt lời chúc trước khi hiển thị" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the flipped value when clicked", () => {
    const onChange = vi.fn();
    render(<ToggleField label="Hiện tên khách mời" value={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Hiện tên khách mời" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
