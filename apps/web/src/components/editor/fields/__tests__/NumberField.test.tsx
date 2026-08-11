// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "../NumberField";

describe("NumberField", () => {
  it("renders the Vietnamese label and current value", () => {
    render(<NumberField label="Rộng (px)" value={800} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Rộng (px)")).toHaveValue(800);
  });

  it("commits a valid finite number on blur", () => {
    const onChange = vi.fn();
    render(<NumberField label="Rộng (px)" value={800} onChange={onChange} />);
    const input = screen.getByLabelText("Rộng (px)");
    fireEvent.change(input, { target: { value: "1200" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1200);
  });

  it("never commits NaN for an empty or non-numeric input", () => {
    const onChange = vi.fn();
    render(<NumberField label="Rộng (px)" value={800} onChange={onChange} />);
    const input = screen.getByLabelText("Rộng (px)");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps to min", () => {
    const onChange = vi.fn();
    render(<NumberField label="Rộng (px)" value={800} onChange={onChange} min={1} />);
    const input = screen.getByLabelText("Rộng (px)");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clamps to max", () => {
    const onChange = vi.fn();
    render(<NumberField label="Rộng (px)" value={800} onChange={onChange} max={2000} />);
    const input = screen.getByLabelText("Rộng (px)");
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(2000);
  });
});
