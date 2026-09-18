// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { TextPanel } from "../TextPanel";

function textSection(html: string): Extract<Section, { type: "text" }> {
  const base = createSection("text") as Extract<Section, { type: "text" }>;
  return { ...base, props: { ...base.props, html } };
}

function storedHtml(id: string): string {
  const section = useEditorStore
    .getState()
    .document.sections.find((s) => s.id === id) as Extract<Section, { type: "text" }>;
  return section.props.html;
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

describe("TextPanel", () => {
  it("edits props.html through the rich-text editor, storing sanitized markup", async () => {
    const section = textSection("<p>Xin chào</p>");
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<TextPanel section={section} />);

    fireEvent.click(screen.getByRole("button", { name: "Danh sách" }));

    await waitFor(() => {
      expect(storedHtml(section.id)).toBe("<ul><li><p>Xin chào</p></li></ul>");
    });
  });

  it("shows the newly selected section's text when the couple switches between two text sections", async () => {
    // `EditorPanel` renders `<Panel section={section} />` with no key, so
    // this component instance is reused across sections. TipTap reads its
    // content once at creation: without the `key` inside TextPanel the
    // second section would open showing the first one's words, and the
    // first edit would overwrite them — silent, unrecoverable data loss.
    const first = textSection("<p>Thiệp một</p>");
    const second = textSection("<p>Thiệp hai</p>");
    useEditorStore.setState({ document: { version: 1, sections: [first, second] } as never });

    const { rerender } = render(<TextPanel section={first} />);
    expect(screen.getByRole("textbox", { name: "Nội dung" })).toHaveTextContent("Thiệp một");

    rerender(<TextPanel section={second} />);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Nội dung" })).toHaveTextContent("Thiệp hai");
    });
    // And an edit now lands on the second section, not the first.
    fireEvent.click(screen.getByRole("button", { name: "Trích dẫn" }));
    await waitFor(() => {
      expect(storedHtml(second.id)).toContain("<blockquote>");
    });
    expect(storedHtml(first.id)).toBe("<p>Thiệp một</p>");
  });
});
