// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { StoryPanel } from "../StoryPanel";

function storySection(): Extract<Section, { type: "story" }> {
  return createSection("story") as Extract<Section, { type: "story" }>;
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

describe("StoryPanel", () => {
  it("shows the empty-state message with no items", () => {
    render(<StoryPanel section={storySection()} />);
    expect(screen.getByText("Chưa có mốc thời gian nào.")).toBeInTheDocument();
  });

  it("adds an item via ListField's Thêm button", () => {
    const section = storySection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<StoryPanel section={section} />);

    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "story" }>;
    expect(updated.props.items).toHaveLength(1);
    expect(updated.props.items[0]).toEqual({ date: "", title: "", text: "", image: "" });
  });

  it("edits a specific item's title without touching its siblings", () => {
    const section = storySection();
    section.props.items = [
      { date: "2020", title: "Gặp nhau", text: "", image: "" },
      { date: "2022", title: "Cầu hôn", text: "", image: "" },
    ];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<StoryPanel section={section} />);

    const rows = screen.getAllByRole("listitem");
    fireEvent.change(within(rows[0]).getByLabelText("Tiêu đề"), { target: { value: "Lần đầu gặp" } });
    fireEvent.blur(within(rows[0]).getByLabelText("Tiêu đề"));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "story" }>;
    expect(updated.props.items[0].title).toBe("Lần đầu gặp");
    expect(updated.props.items[1].title).toBe("Cầu hôn");
  });
});
