// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "../TextField";

describe("TextField", () => {
  it("renders the Vietnamese label and the current value", () => {
    render(<TextField label="Tên chú rể" value="Ngọc Hải" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Tên chú rể")).toHaveValue("Ngọc Hải");
  });

  it("updates the visible value on every keystroke without calling onChange yet", () => {
    const onChange = vi.fn();
    render(<TextField label="Tên chú rể" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tên chú rể"), { target: { value: "Minh" } });
    expect(screen.getByLabelText("Tên chú rể")).toHaveValue("Minh");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits the value to onChange after the debounce delay", async () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(<TextField label="Tên chú rể" value="" onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("Tên chú rể"), { target: { value: "Minh" } });
      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onChange).toHaveBeenCalledWith("Minh");
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits immediately on blur, without waiting for the debounce", () => {
    const onChange = vi.fn();
    render(<TextField label="Tên chú rể" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Tên chú rể");
    fireEvent.change(input, { target: { value: "Minh" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("Minh");
  });

  it("flushes a pending debounced edit on unmount instead of dropping it", () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      const { unmount } = render(<TextField label="Tên chú rể" value="" onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("Tên chú rể"), { target: { value: "Minh" } });
      unmount();
      expect(onChange).toHaveBeenCalledWith("Minh");
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies sanitize synchronously on every keystroke (e.g. digits-only)", () => {
    const onChange = vi.fn();
    render(
      <TextField label="Số tài khoản" value="" onChange={onChange} sanitize={(raw) => raw.replace(/\D/g, "")} />,
    );
    fireEvent.change(screen.getByLabelText("Số tài khoản"), { target: { value: "abc123def" } });
    expect(screen.getByLabelText("Số tài khoản")).toHaveValue("123");
  });

  it("truncates to maxLength", () => {
    const onChange = vi.fn();
    render(<TextField label="Monogram" value="" onChange={onChange} maxLength={4} />);
    fireEvent.change(screen.getByLabelText("Monogram"), { target: { value: "MK & TH" } });
    expect(screen.getByLabelText("Monogram")).toHaveValue("MK &");
  });

  it("shows a Vietnamese error message when provided", () => {
    render(<TextField label="Số tài khoản" value="1" onChange={vi.fn()} error="Số tài khoản không hợp lệ" />);
    expect(screen.getByText("Số tài khoản không hợp lệ")).toBeInTheDocument();
  });

  it("re-syncs the visible value when the external value prop changes (e.g. switching selection)", () => {
    const { rerender } = render(<TextField label="Tên chú rể" value="Minh" onChange={vi.fn()} />);
    rerender(<TextField label="Tên chú rể" value="Hải" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Tên chú rể")).toHaveValue("Hải");
  });
});
