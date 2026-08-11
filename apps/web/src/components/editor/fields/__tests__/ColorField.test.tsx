// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorField } from "../ColorField";

describe("ColorField", () => {
  it("renders both the color swatch input and the hex text input with the current value", () => {
    render(<ColorField label="Màu chủ đạo" value="#A62B45" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Màu chủ đạo")).toHaveValue("#a62b45");
    expect(screen.getByLabelText("Mã màu Màu chủ đạo")).toHaveValue("#A62B45");
  });

  it("commits a valid hex typed into the text input", () => {
    const onChange = vi.fn();
    render(<ColorField label="Màu nền" value="#FFFFFF" onChange={onChange} />);
    const hexInput = screen.getByLabelText("Mã màu Màu nền");
    fireEvent.change(hexInput, { target: { value: "#112233" } });
    fireEvent.blur(hexInput);
    expect(onChange).toHaveBeenCalledWith("#112233");
  });

  it("does not commit an invalid hex string, and shows a Vietnamese error", () => {
    const onChange = vi.fn();
    render(<ColorField label="Màu nền" value="#FFFFFF" onChange={onChange} />);
    const hexInput = screen.getByLabelText("Mã màu Màu nền");
    fireEvent.change(hexInput, { target: { value: "not-a-color" } });
    fireEvent.blur(hexInput);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Mã màu không hợp lệ, ví dụ: #A62B45")).toBeInTheDocument();
  });

  it("commits immediately when the native color picker changes", () => {
    const onChange = vi.fn();
    render(<ColorField label="Màu chủ đạo" value="#A62B45" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Màu chủ đạo"), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenCalledWith("#00ff00");
  });
});
