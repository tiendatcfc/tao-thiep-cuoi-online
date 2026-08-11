// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "../SelectField";

const OPTIONS = [
  { value: "grid", label: "Lưới" },
  { value: "masonry", label: "Xếp tầng" },
  { value: "carousel", label: "Băng chuyền" },
];

describe("SelectField", () => {
  it("renders the Vietnamese label and options, with the current value selected", () => {
    render(<SelectField label="Bố cục" value="masonry" onChange={vi.fn()} options={OPTIONS} />);
    const select = screen.getByLabelText("Bố cục") as HTMLSelectElement;
    expect(select.value).toBe("masonry");
    expect(screen.getByRole("option", { name: "Lưới" })).toBeInTheDocument();
  });

  it("calls onChange immediately (no debounce) when a new option is chosen", () => {
    const onChange = vi.fn();
    render(<SelectField label="Bố cục" value="grid" onChange={onChange} options={OPTIONS} />);
    fireEvent.change(screen.getByLabelText("Bố cục"), { target: { value: "carousel" } });
    expect(onChange).toHaveBeenCalledWith("carousel");
  });

  it("never offers a value outside the given options list", () => {
    render(<SelectField label="Bố cục" value="grid" onChange={vi.fn()} options={OPTIONS} />);
    const select = screen.getByLabelText("Bố cục") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["grid", "masonry", "carousel"]);
  });
});
