// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";

// EditorLayout mounts `useAutosave`, which schedules a `fetch` after the
// document goes dirty. None of these tests mutate the store, so no fetch
// should ever fire — stubbing it just guards against a real network call
// leaking out of the test if that assumption is ever violated.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { EditorLayout } from "../EditorLayout";

/**
 * jsdom's own `window.matchMedia` always reports `matches: false` — it has
 * no real layout engine to evaluate a media feature against — so without
 * this, `EditorLayout` would only ever be testable in its mobile-tabs
 * shape. This fakes a fixed viewport per test instead.
 */
function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

beforeEach(() => {
  resetStore();
  fetchMock.mockReset();
  mockViewport(true); // desktop by default; individual tests override.
});

const baseProps = {
  invitationId: "inv-1",
  slug: "demo",
  initialDocument: createDefaultDocument(),
  initialShowBadge: true,
};

describe("EditorLayout", () => {
  it("seeds the store with the initial document on mount", () => {
    const doc = createDefaultDocument();
    doc.theme.primary = "#TESTVAL";
    render(<EditorLayout {...baseProps} initialDocument={doc} />);
    expect(useEditorStore.getState().document.theme.primary).toBe("#TESTVAL");
  });

  it("shows the document-level property tabs when no section is selected (desktop)", () => {
    render(<EditorLayout {...baseProps} />);
    expect(screen.getByRole("tab", { name: "Giao diện" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Nhạc nền" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Hiệu ứng mở màn" })).toBeInTheDocument();
  });

  it("renders an enabled Xuất bản button that opens the publish dialog", () => {
    render(<EditorLayout {...baseProps} />);
    const button = screen.getByRole("button", { name: "Xuất bản" });
    expect(button).not.toBeDisabled();

    expect(screen.queryByRole("dialog", { name: "Xuất bản thiệp" })).not.toBeInTheDocument();
    act(() => {
      button.click();
    });
    expect(screen.getByRole("dialog", { name: "Xuất bản thiệp" })).toBeInTheDocument();
  });

  it("closes the publish dialog from its own close button", () => {
    render(<EditorLayout {...baseProps} />);
    act(() => {
      screen.getByRole("button", { name: "Xuất bản" }).click();
    });
    expect(screen.getByRole("dialog", { name: "Xuất bản thiệp" })).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Đóng" }).click();
    });
    expect(screen.queryByRole("dialog", { name: "Xuất bản thiệp" })).not.toBeInTheDocument();
  });

  it("shows the invitation slug in the header", () => {
    render(<EditorLayout {...baseProps} />);
    expect(screen.getByText("demo")).toBeInTheDocument();
  });

  it("shows 'Đang lưu…' while saving", () => {
    render(<EditorLayout {...baseProps} />);
    act(() => {
      useEditorStore.getState().setSaving(true);
    });
    expect(screen.getByText("Đang lưu…")).toBeInTheDocument();
  });

  it("shows 'Đã lưu lúc HH:mm' after a successful save", () => {
    render(<EditorLayout {...baseProps} />);
    const at = new Date(2026, 0, 1, 9, 5).getTime();
    act(() => {
      useEditorStore.getState().markSaved(at);
    });
    expect(screen.getByText("Đã lưu lúc 09:05")).toBeInTheDocument();
  });

  it("shows the distinct 'invalid document' message when autosave reports that error kind", async () => {
    // The document fails the API's schema check the moment it's PATCHed;
    // `useAutosave` runs the same check client-side first, so this drives
    // the failure end-to-end through the real hook instead of stubbing it.
    vi.useFakeTimers();
    try {
      render(<EditorLayout {...baseProps} />);
      act(() => {
        useEditorStore.setState({
          document: { ...createDefaultDocument(), theme: undefined } as never,
          dirty: true,
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(
        screen.getByText(
          "Nội dung chưa hợp lệ, chưa thể lưu — vui lòng kiểm tra lại mục đang chỉnh sửa.",
        ),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // C5: the old "Lưu thất bại — sẽ thử lại" copy was a lie (useAutosave
  // starts no retry loop on a network failure) and rendered with the exact
  // same styling as the success state, so a couple could easily miss it.
  describe("network failure (C5)", () => {
    it("shows an honest failure message (no false 'will retry automatically' claim), styled distinctly from the success state, with a manual retry action", async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
        render(<EditorLayout {...baseProps} />);
        act(() => {
          useEditorStore.getState().updateTheme({ primary: "#111111" });
        });

        await act(async () => {
          vi.advanceTimersByTime(2000);
        });

        const status = screen.getByText("Lưu thất bại — vui lòng thử lưu lại.", { exact: false });
        expect(status).toBeInTheDocument();
        // Must not claim an automatic retry that doesn't exist.
        expect(screen.queryByText(/sẽ thử lại/)).not.toBeInTheDocument();
        // Distinct from the (gray) success-state styling.
        expect(status.className).toMatch(/text-red-700/);
        expect(status.className).not.toMatch(/text-gray-500/);

        expect(screen.getByRole("button", { name: "Thử lưu lại" })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("clicking 'Thử lưu lại' forces an immediate retry and clears the failure once it succeeds", async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
        render(<EditorLayout {...baseProps} />);
        act(() => {
          useEditorStore.getState().updateTheme({ primary: "#111111" });
        });
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ savedAt: Date.now() }) });
        await act(async () => {
          screen.getByRole("button", { name: "Thử lưu lại" }).click();
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(screen.queryByText("Lưu thất bại — vui lòng thử lưu lại.", { exact: false })).not.toBeInTheDocument();
        expect(screen.getByText(/^Đã lưu lúc \d{2}:\d{2}$/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("responsive single-mount layout", () => {
    it("at desktop width, mounts exactly one three-pane layout with exactly one preview pane and no tab bar", () => {
      mockViewport(true);
      render(<EditorLayout {...baseProps} />);

      expect(screen.getAllByTestId("preview-pane")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Mục" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Xem trước" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
      // The section list and its own "+ Thêm mục" control are mounted once.
      expect(screen.getAllByRole("group", { name: "Thêm mục" })).toHaveLength(1);
    });

    it("below 1024px, renders the tab bar and mounts only the active tab's pane", () => {
      mockViewport(false);
      render(<EditorLayout {...baseProps} />);

      expect(screen.getByRole("button", { name: "Mục" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Xem trước" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chỉnh sửa" })).toBeInTheDocument();

      // Defaults to the "preview" tab: exactly one PreviewPane, no
      // SectionList and no property panel mounted alongside it.
      expect(screen.getAllByTestId("preview-pane")).toHaveLength(1);
      expect(screen.queryByRole("group", { name: "Thêm mục" })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Giao diện" })).not.toBeInTheDocument();

      act(() => {
        screen.getByRole("button", { name: "Mục" }).click();
      });
      expect(screen.queryByTestId("preview-pane")).not.toBeInTheDocument();
      expect(screen.getAllByRole("group", { name: "Thêm mục" })).toHaveLength(1);

      act(() => {
        screen.getByRole("button", { name: "Chỉnh sửa" }).click();
      });
      expect(screen.queryByTestId("preview-pane")).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Thêm mục" })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Giao diện" })).toBeInTheDocument();
    });
  });
});
