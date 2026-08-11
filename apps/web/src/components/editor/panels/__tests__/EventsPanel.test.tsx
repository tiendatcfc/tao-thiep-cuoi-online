// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { EventsPanel } from "../EventsPanel";

function eventsSection(): Extract<Section, { type: "events" }> {
  const base = createSection("events") as Extract<Section, { type: "events" }>;
  base.props.items = [
    { name: "Lễ Vu Quy", time: "09:00", date: "2026-12-20T09:00:00+07:00", address: "Nhà gái", mapUrl: "" },
  ];
  return base;
}

beforeEach(() => {
  useEditorStore.setState({
    document: { version: 1, sections: [] } as never,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("EventsPanel", () => {
  it("renders each event's fields with their current values", () => {
    render(<EventsPanel section={eventsSection()} />);
    expect(screen.getByLabelText("Tên sự kiện")).toHaveValue("Lễ Vu Quy");
    expect(screen.getByLabelText("Giờ hiển thị")).toHaveValue("09:00");
    expect(screen.getByLabelText("Địa điểm")).toHaveValue("Nhà gái");
  });

  it("moving the only-two-item list down then removing leaves a schema-valid items array", () => {
    const section = eventsSection();
    section.props.items.push({ name: "Lễ Thành Hôn", time: "18:00", date: "2026-12-20T18:00:00+07:00", address: "Nhà trai", mapUrl: "" });
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<EventsPanel section={section} />);

    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Xoá" }));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "events" }>;
    expect(updated.props.items).toHaveLength(1);
    expect(updated.props.items[0].name).toBe("Lễ Thành Hôn");
  });
});
