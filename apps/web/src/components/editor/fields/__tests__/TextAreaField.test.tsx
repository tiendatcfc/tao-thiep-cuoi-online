// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextAreaField } from "../TextAreaField";

describe("TextAreaField", () => {
  it("renders the Vietnamese label and current value", () => {
    render(<TextAreaField label="Mô tả" value="Xin chào" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Mô tả")).toHaveValue("Xin chào");
  });

  it("debounces onChange", () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(<TextAreaField label="Mô tả" value="" onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "Nội dung mới" } });
      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onChange).toHaveBeenCalledWith("Nội dung mới");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes on blur", () => {
    const onChange = vi.fn();
    render(<TextAreaField label="Mô tả" value="" onChange={onChange} />);
    const textarea = screen.getByLabelText("Mô tả");
    fireEvent.change(textarea, { target: { value: "abc" } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});
