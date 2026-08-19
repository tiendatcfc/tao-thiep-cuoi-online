// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { AutosaveStatusContext } from "../AutosaveStatusContext";
import { PublishDialog } from "../PublishDialog";
import type { AutosaveErrorKind } from "../useAutosave";

function documentWithCoverNames(groomName: string, brideName: string) {
  const doc = createDefaultDocument();
  const cover = doc.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
  if (!cover) throw new Error("default document has no cover section");
  cover.props.groomName = groomName;
  cover.props.brideName = brideName;
  return doc;
}

function resetStore(document = createDefaultDocument()) {
  useEditorStore.setState({
    document,
    version: 0,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetStore();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseProps = {
  invitationId: "inv-1",
  slug: "test-editor-abc123",
  initialShowBadge: true,
};

describe("PublishDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<PublishDialog {...baseProps} open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prefills the slug input from the cover section's groom/bride names", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    expect(screen.getByLabelText("Đường dẫn thiệp")).toHaveValue("minh-lan");
  });

  it("falls back to toSlug(slug) when the cover names are empty", () => {
    resetStore(documentWithCoverNames("", ""));
    render(<PublishDialog {...baseProps} slug="Đám Cưới Của Tôi" open onClose={vi.fn()} />);

    expect(screen.getByLabelText("Đường dẫn thiệp")).toHaveValue("dam-cuoi-cua-toi");
  });

  it("disables the submit button and shows a Vietnamese hint for an invalid slug", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    const input = screen.getByLabelText("Đường dẫn thiệp");
    fireEvent.change(input, { target: { value: "ab" } });

    expect(screen.getByRole("button", { name: "Xuất bản" })).toBeDisabled();
    expect(
      screen.getByText(/chỉ được chứa chữ thường không dấu, số và dấu gạch ngang/i),
    ).toBeInTheDocument();
  });

  it("enables the submit button for a valid slug", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Xuất bản" })).not.toBeDisabled();
  });

  it("shows the conflict message and keeps the dialog open on a 409 response", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Đường dẫn này đã được sử dụng cho thiệp khác, vui lòng chọn đường dẫn khác." }),
    });
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    await waitFor(() =>
      expect(
        screen.getByText("Đường dẫn này đã được sử dụng cho thiệp khác, vui lòng chọn đường dẫn khác."),
      ).toBeInTheDocument(),
    );
    // Still on the form (dialog stayed open) — the slug input is still there.
    expect(screen.getByLabelText("Đường dẫn thiệp")).toBeInTheDocument();
  });

  it("shows the live link and copy button after a successful publish, guarding a missing clipboard", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "minh-lan", publishedAt: new Date().toISOString() }),
    });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const onUncaughtError = vi.fn();
    window.addEventListener("error", onUncaughtError);

    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    const copyButton = await screen.findByRole("button", { name: "Sao chép liên kết" });
    expect(screen.getByRole("link", { name: "Xem thiệp" })).toHaveAttribute("href", "/i/minh-lan");

    fireEvent.click(copyButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUncaughtError).not.toHaveBeenCalled();

    window.removeEventListener("error", onUncaughtError);
  });

  it("copies the live link when the clipboard is available", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "minh-lan", publishedAt: new Date().toISOString() }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    const copyButton = await screen.findByRole("button", { name: "Sao chép liên kết" });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/i/minh-lan")));
    expect(await screen.findByText("Đã sao chép!")).toBeInTheDocument();
  });

  // Coordinator review fix: the badge toggle used to fire its own
  // independent `fetch` straight to `PATCH /api/invitations/[id]`. That's
  // exactly the same endpoint `useAutosave` autosaves the document through,
  // and once every successful PATCH bumps the shared row `version` (Task
  // 1), two independent writers racing to read/send that version can
  // produce a FALSE conflict that has nothing to do with another tab (see
  // `useAutosave`'s docstring, point 4, and `useAutosave.test.tsx`'s
  // "settings save shares the writer with document autosave" suite for the
  // race itself). The fix routes the toggle through `saveSettings` (from
  // `AutosaveStatusContext`) instead — these tests prove THIS dialog calls
  // that shared writer rather than reinventing its own `fetch`, not the
  // race-safety itself (that's `useAutosave`'s job to prove).
  function renderWithSaveSettings(saveSettings: (settings: { showBadge: boolean }) => Promise<AutosaveErrorKind>) {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    return render(
      <AutosaveStatusContext.Provider value={{ error: null, flush: async () => null, saveSettings }}>
        <PublishDialog {...baseProps} open onClose={vi.fn()} />
      </AutosaveStatusContext.Provider>,
    );
  }

  it("flips the badge toggle through the shared saveSettings writer instead of its own fetch, and never calls the publish route", async () => {
    const saveSettings = vi.fn().mockResolvedValue(null as AutosaveErrorKind);
    renderWithSaveSettings(saveSettings);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ showBadge: false }));
    // No direct `fetch` to `/api/invitations/[id]` from this dialog at all
    // — `saveSettings` (stubbed above) is the only writer.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverts the optimistic toggle when saveSettings reports any non-null outcome (network failure, invalid document, or a genuine cross-tab conflict)", async () => {
    const saveSettings = vi.fn().mockResolvedValue("conflict" as AutosaveErrorKind);
    renderWithSaveSettings(saveSettings);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false); // optimistic flip, before saveSettings resolves

    await waitFor(() => expect(checkbox.checked).toBe(true)); // reverted once saveSettings resolves non-null
  });

  // C2: publishing used to POST straight away, and the server re-reads
  // `invitation.document` from the DB — up to AUTOSAVE_DEBOUNCE_MS (2s)
  // behind the live editor. `flush()` (from AutosaveStatusContext) must be
  // awaited BEFORE the publish request fires, and its outcome must gate
  // whether that request happens at all.
  describe("flushes the pending autosave before publishing (C2)", () => {
    function renderWithFlush(flush: () => Promise<AutosaveErrorKind>) {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      return render(
        <AutosaveStatusContext.Provider value={{ error: null, flush, saveSettings: async () => null }}>
          <PublishDialog {...baseProps} open onClose={vi.fn()} />
        </AutosaveStatusContext.Provider>,
      );
    }

    it("awaits flush() before sending the publish request", async () => {
      let resolveFlush!: (value: AutosaveErrorKind) => void;
      const flush = vi.fn(
        () =>
          new Promise<AutosaveErrorKind>((resolve) => {
            resolveFlush = resolve;
          }),
      );
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ slug: "minh-lan" }) });
      renderWithFlush(flush);

      fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

      expect(flush).toHaveBeenCalledTimes(1);
      // The real proof this is actually AWAITED, not fire-and-forget: no
      // publish request yet while flush's promise is still pending.
      expect(fetchMock).not.toHaveBeenCalled();
      // ...and the button is disabled meanwhile (blocks a second submit
      // while the flush is in flight).
      expect(screen.getByRole("button", { name: "Đang xuất bản…" })).toBeDisabled();

      resolveFlush(null);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invitations/inv-1/publish",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("refuses to publish and shows the invalid-document message when flush() reports the document is invalid, without ever calling the publish route", async () => {
      const flush = vi.fn().mockResolvedValue("invalid" as AutosaveErrorKind);
      renderWithFlush(flush);

      fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

      await waitFor(() =>
        expect(
          screen.getByText("Nội dung thiệp hiện tại chưa hợp lệ, vui lòng kiểm tra lại trước khi xuất bản."),
        ).toBeInTheDocument(),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses to publish when flush() itself fails (network), rather than publishing a possibly-stale version", async () => {
      const flush = vi.fn().mockResolvedValue("network" as AutosaveErrorKind);
      renderWithFlush(flush);

      fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

      await waitFor(() =>
        expect(screen.getByText("Xuất bản thất bại, vui lòng thử lại.")).toBeInTheDocument(),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("proceeds to publish once flush() resolves successfully (null)", async () => {
      const flush = vi.fn().mockResolvedValue(null as AutosaveErrorKind);
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ slug: "minh-lan" }) });
      renderWithFlush(flush);

      fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

      await screen.findByText("Thiệp của bạn đã được xuất bản!");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invitations/inv-1/publish",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  // Coordinator review fix: role="dialog" aria-modal="true" is a promise
  // that focus stays inside while open — these prove the promise is kept.
  describe("keyboard behavior (coordinator review fix)", () => {
    it("calls onClose when Escape is pressed", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      const onClose = vi.fn();
      render(<PublishDialog {...baseProps} open onClose={onClose} />);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("focuses something inside the dialog as soon as it opens", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    });

    it("traps forward Tab: from the last focusable element it wraps to the first", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

      const closeButton = screen.getByRole("button", { name: "Đóng" });
      const submitButton = screen.getByRole("button", { name: "Xuất bản" });
      submitButton.focus();
      expect(document.activeElement).toBe(submitButton);

      fireEvent.keyDown(document, { key: "Tab" });

      expect(document.activeElement).toBe(closeButton);
    });

    it("traps backward Shift+Tab: from the first focusable element it wraps to the last", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

      const closeButton = screen.getByRole("button", { name: "Đóng" });
      const submitButton = screen.getByRole("button", { name: "Xuất bản" });
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);

      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

      expect(document.activeElement).toBe(submitButton);
    });

    it("does not trap Tab presses once the dialog is closed", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      const onClose = vi.fn();
      const { rerender } = render(<PublishDialog {...baseProps} open onClose={onClose} />);
      rerender(<PublishDialog {...baseProps} open={false} onClose={onClose} />);

      // No listener left attached — pressing Escape after close must not
      // call onClose again (would indicate a leaked event listener).
      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });

    // Coordinator review fix: EditorLayout passes `onClose={() =>
    // setPublishOpen(false)}` — a fresh closure every render. Any unrelated
    // parent re-render while the dialog is open (autosave's error state
    // flipping, useMediaQuery crossing a breakpoint, ...) used to re-run the
    // autofocus effect (keyed on `[open, onClose]`) and yank focus back to
    // the close button mid-typing.
    it("does not steal focus back to the close button when the parent re-renders with a new onClose identity", () => {
      resetStore(documentWithCoverNames("Minh", "Lan"));
      const { rerender } = render(<PublishDialog {...baseProps} open onClose={() => {}} />);

      const slugInput = screen.getByLabelText("Đường dẫn thiệp");
      slugInput.focus();
      expect(document.activeElement).toBe(slugInput);

      // Simulate an unrelated parent re-render: `open` stays `true`, but
      // `onClose` is a brand-new function identity (exactly what
      // `EditorLayout`'s inline arrow function produces on every render).
      rerender(<PublishDialog {...baseProps} open onClose={() => {}} />);

      expect(document.activeElement).toBe(slugInput);
    });
  });
});
