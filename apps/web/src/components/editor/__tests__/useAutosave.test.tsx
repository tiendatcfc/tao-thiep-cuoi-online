// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { useAutosave } from "../useAutosave";

const INVITATION_ID = "inv-123";

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  resetStore();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ savedAt: Date.now() }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAutosave", () => {
  it("does not call PATCH while the document is clean", () => {
    renderHook(() => useAutosave(INVITATION_ID));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounces to a single PATCH call 2s after a mutation makes the document dirty", async () => {
    renderHook(() => useAutosave(INVITATION_ID));

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/invitations/${INVITATION_ID}`);
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.document.theme.primary).toBe("#111111");
  });

  it("collapses rapid successive changes into a single PATCH call", async () => {
    renderHook(() => useAutosave(INVITATION_ID));

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#222222" });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Only 2s since the *second* change — the first change's timer should
    // have been cancelled, so no call yet.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.document.theme.primary).toBe("#222222");
  });

  it("sets saving around the request and marks the document saved on success", async () => {
    renderHook(() => useAutosave(INVITATION_ID));

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().saving).toBe(false);
    expect(useEditorStore.getState().lastSavedAt).toEqual(expect.any(Number));
  });

  it("keeps dirty true and reports an error when the PATCH fails, then retries on the next change", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "fail" }) });

    const { result } = renderHook(() => useAutosave(INVITATION_ID));

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(result.current.error).toBe(true);

    // Next change retries — no infinite loop, exactly one more call.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: Date.now() }) });
    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#222222" });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("cancels the pending debounce timer on unmount", () => {
    const { unmount } = renderHook(() => useAutosave(INVITATION_ID));

    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns via the standard beforeunload prompt while dirty", () => {
    renderHook(() => useAutosave(INVITATION_ID));
    act(() => {
      useEditorStore.getState().updateTheme({ primary: "#111111" });
    });

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not warn on beforeunload when the document is clean", () => {
    renderHook(() => useAutosave(INVITATION_ID));

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
