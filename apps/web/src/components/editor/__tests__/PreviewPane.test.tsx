// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";

/**
 * `PreviewPane` wraps the real `InvitePage`, but exercising the real
 * component tree here would just re-test `InvitePage` (already covered by
 * its own suite). What's specific to `PreviewPane` is the click-to-select
 * delegation and the error boundary around whatever `InvitePage` renders —
 * so it's mocked down to two `[data-section-id]` blocks (mirroring what
 * `SectionWrapper` actually emits) plus a controllable throw for the error
 * boundary test.
 */
const { InvitePageMock } = vi.hoisted(() => ({ InvitePageMock: vi.fn() }));
vi.mock("@/components/invite/InvitePage", () => ({
  InvitePage: (props: unknown) => InvitePageMock(props),
}));

import { PreviewPane } from "../PreviewPane";

afterEach(cleanup);

beforeEach(() => {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
  InvitePageMock.mockReset();
  InvitePageMock.mockImplementation(() => (
    <div>
      <div data-section-id="section-a">A</div>
      <div data-section-id="section-b">
        <span data-testid="nested">nested text</span>
      </div>
    </div>
  ));
});

describe("PreviewPane", () => {
  it("selects the clicked section's id in the store", () => {
    render(<PreviewPane />);
    fireEvent.click(screen.getByText("A"));
    expect(useEditorStore.getState().selectedSectionId).toBe("section-a");
  });

  it("walks up from a nested click target to the nearest [data-section-id]", () => {
    render(<PreviewPane />);
    fireEvent.click(screen.getByTestId("nested"));
    expect(useEditorStore.getState().selectedSectionId).toBe("section-b");
  });

  it("does nothing when the click lands outside any [data-section-id]", () => {
    useEditorStore.getState().selectSection("section-a");
    render(<PreviewPane />);
    // click the pane's own container, not one of the mocked section divs
    fireEvent.click(screen.getByTestId("preview-pane"));
    expect(useEditorStore.getState().selectedSectionId).toBe("section-a");
  });

  it("re-renders InvitePage with the latest store document (live preview)", () => {
    render(<PreviewPane />);
    InvitePageMock.mockClear();

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#123123" });
    });

    expect(InvitePageMock).toHaveBeenCalled();
    const lastCall = InvitePageMock.mock.calls.at(-1)?.[0] as { document: { theme: { primary: string } } };
    expect(lastCall.document.theme.primary).toBe("#123123");
  });

  it("shows a Vietnamese fallback instead of crashing when the preview throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    InvitePageMock.mockImplementation(() => {
      throw new Error("boom");
    });

    render(<PreviewPane />);

    expect(screen.getByText("Không thể hiển thị xem trước")).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("recovers once the document changes again after a crash, instead of staying stuck on the fallback", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // A plain `mockImplementationOnce` isn't reliable here: React retries a
    // throwing render synchronously before giving up to the boundary, which
    // can consume the "once" on that internal retry rather than the render
    // this test cares about. A flag that stays `true` until the test flips
    // it keeps every render attempt during the "crashed" phase throwing.
    let shouldThrow = true;
    InvitePageMock.mockImplementation(() => {
      if (shouldThrow) throw new Error("boom");
      return <div data-section-id="section-a">A</div>;
    });

    render(<PreviewPane />);
    expect(screen.getByText("Không thể hiển thị xem trước")).toBeInTheDocument();

    // The next mutation is the "user fixed it" signal — the boundary should
    // attempt to render fresh again rather than being stuck forever.
    shouldThrow = false;
    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#654321" });
    });

    expect(screen.queryByText("Không thể hiển thị xem trước")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
