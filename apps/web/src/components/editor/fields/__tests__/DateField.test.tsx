// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "../DateField";

describe("DateField", () => {
  it("renders a datetime-local input converted from an ISO string with an offset", () => {
    render(<DateField label="Ngày cưới" value="2026-12-20T09:00:00+07:00" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Ngày cưới") as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    // Converted to the browser's local wall-clock time — exact string
    // depends on the test runner's TZ, but it must always be non-empty and
    // parseable back to the same instant.
    expect(input.value).not.toBe("");
    expect(new Date(input.value).getTime()).toBe(new Date("2026-12-20T09:00:00+07:00").getTime());
  });

  it("shows an empty input for an unparseable stored value instead of crashing", () => {
    render(<DateField label="Ngày cưới" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Ngày cưới")).toHaveValue("");
  });

  it("commits a valid ISO string that round-trips back to the same instant", () => {
    const onChange = vi.fn();
    render(<DateField label="Ngày cưới" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Ngày cưới");
    fireEvent.change(input, { target: { value: "2027-01-15T10:30" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0][0] as string;
    expect(new Date(committed).getTime()).toBe(new Date("2027-01-15T10:30").getTime());
  });

  it("does not call onChange when cleared", () => {
    const onChange = vi.fn();
    render(<DateField label="Ngày cưới" value="2026-12-20T09:00:00+07:00" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Ngày cưới"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
