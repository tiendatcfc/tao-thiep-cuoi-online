// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListField } from "../ListField";

interface Item {
  title: string;
}

function renderList(items: Item[], onChange = vi.fn()) {
  render(
    <ListField<Item>
      label="Các mốc thời gian"
      items={items}
      onChange={onChange}
      createItem={() => ({ title: "" })}
      itemLabel={(item, i) => item.title || `Mốc ${i + 1}`}
      renderItem={(item, _index, update) => (
        <input aria-label="Tiêu đề" value={item.title} onChange={(e) => update({ title: e.target.value })} />
      )}
    />,
  );
  return onChange;
}

describe("ListField", () => {
  it("renders one row per item plus an add button", () => {
    renderList([{ title: "Gặp nhau" }, { title: "Cầu hôn" }]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Thêm" })).toBeInTheDocument();
  });

  it("adds a new item via createItem", () => {
    const onChange = renderList([{ title: "Gặp nhau" }]);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect(onChange).toHaveBeenCalledWith([{ title: "Gặp nhau" }, { title: "" }]);
  });

  it("removes an item via its own Xoá button", () => {
    const onChange = renderList([{ title: "Gặp nhau" }, { title: "Cầu hôn" }]);
    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Xoá" }));
    expect(onChange).toHaveBeenCalledWith([{ title: "Cầu hôn" }]);
  });

  it("moves an item down and up", () => {
    const onChange = renderList([{ title: "A" }, { title: "B" }, { title: "C" }]);
    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Xuống" }));
    expect(onChange).toHaveBeenLastCalledWith([{ title: "B" }, { title: "A" }, { title: "C" }]);
  });

  it("disables Lên on the first row and Xuống on the last row", () => {
    renderList([{ title: "A" }, { title: "B" }]);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("button", { name: "Lên" })).toBeDisabled();
    expect(within(rows[0]).getByRole("button", { name: "Xuống" })).toBeEnabled();
    expect(within(rows[1]).getByRole("button", { name: "Xuống" })).toBeDisabled();
    expect(within(rows[1]).getByRole("button", { name: "Lên" })).toBeEnabled();
  });

  it("calls onChange with the whole updated item when a sub-field changes", () => {
    const onChange = renderList([{ title: "Gặp nhau" }]);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Ngày gặp đầu tiên" } });
    expect(onChange).toHaveBeenCalledWith([{ title: "Ngày gặp đầu tiên" }]);
  });

  it("shows an empty-state message when there are no items yet", () => {
    render(
      <ListField<Item>
        label="Các mốc thời gian"
        items={[]}
        onChange={vi.fn()}
        createItem={() => ({ title: "" })}
        emptyMessage="Chưa có mốc thời gian nào"
        renderItem={() => null}
      />,
    );
    expect(screen.getByText("Chưa có mốc thời gian nào")).toBeInTheDocument();
  });
});
