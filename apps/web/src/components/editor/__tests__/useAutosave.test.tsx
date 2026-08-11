// @vitest-environment jsdom
import { createDefaultDocument, type InvitationDocument } from "@hpwd/schema";
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

  it("keeps dirty true and reports a 'network' error when the PATCH fails, then retries on the next change", async () => {
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
    expect(result.current.error).toBe("network");

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
    expect(result.current.error).toBe(null);
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

  describe("unmount flush", () => {
    it("fires exactly one best-effort keepalive PATCH with the current document when dirty at unmount", () => {
      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        // A Next.js client-side route change / Back button unmounts this
        // hook without ever firing `beforeunload` — this is that case: the
        // 2s debounce never gets to elapse before the component goes away.
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      unmount();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/invitations/${INVITATION_ID}`);
      expect(init.method).toBe("PATCH");
      expect(init.keepalive).toBe(true);
      const body = JSON.parse(init.body as string);
      expect(body.document.theme.primary).toBe("#111111");

      // The pending debounce timer must have been cancelled too, not left
      // to *also* fire after the flush.
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not call PATCH on unmount when the document is clean", () => {
      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));
      unmount();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not flush a client-side-invalid document on unmount", () => {
      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));
      const invalidDoc = { ...createDefaultDocument(), theme: undefined } as unknown as InvitationDocument;
      act(() => {
        useEditorStore.setState({ document: invalidDoc, dirty: true });
      });

      unmount();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborts a still-in-flight save before flushing, so only the latest document can land", () => {
      // Concrete race this guards against: edit1's debounce fires and PATCHes
      // v1 (awaiting a response); edit2 arrives and arms its own 2s timer;
      // the component unmounts before that timer elapses, so edit2 never
      // reaches the serialisation queue on its own. Without aborting v1
      // first, both v1 and the v2 keepalive flush would be in flight at
      // once, and the server (last-write-wins, no ordering guarantee) could
      // apply v1 *after* v2 — silently reverting to stale content with the
      // tab already closed and nothing left to retry.
      let capturedInit: RequestInit | undefined;
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        capturedInit = init;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // The first save (v1) is in flight; its response never resolves here.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedInit?.signal?.aborted).toBe(false);

      // A further edit (v2) lands before unmount — its own 2s debounce
      // timer is armed but never gets the chance to elapse.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });

      unmount();

      // v1's request must have been aborted...
      expect(capturedInit?.signal?.aborted).toBe(true);
      // ...and exactly one more request — the keepalive flush — sent,
      // carrying v2 (the latest document), not v1.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, flushInit] = fetchMock.mock.calls[1];
      expect(url).toBe(`/api/invitations/${INVITATION_ID}`);
      expect(flushInit.keepalive).toBe(true);
      const body = JSON.parse(flushInit.body as string);
      expect(body.document.theme.primary).toBe("#222222");

      // Aborting v1 is intentional, not a real failure — it must not be
      // logged as one.
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe("client-side validation before sending", () => {
    it("does not PATCH a schema-invalid document and reports the 'invalid' error kind instead of retrying blindly", async () => {
      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      const invalidDoc = { ...createDefaultDocument(), theme: undefined } as unknown as InvitationDocument;

      act(() => {
        useEditorStore.setState({ document: invalidDoc, dirty: true });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe("invalid");
      // Whole-document validation means this can never succeed until the
      // offending field is fixed — `dirty` correctly stays true, but no
      // network request should ever be wasted retrying it.
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().saving).toBe(false);
    });

    it("resumes sending once a later change makes the document valid again", async () => {
      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      const invalidDoc = { ...createDefaultDocument(), theme: undefined } as unknown as InvitationDocument;

      act(() => {
        useEditorStore.setState({ document: invalidDoc, dirty: true });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => {
        useEditorStore.setState({ document: createDefaultDocument(), dirty: true });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(null);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
  });

  // C2/C5: `flush()` is the explicit-save escape hatch both PublishDialog
  // (flush the live document before publishing — see PublishDialog.test.tsx)
  // and the "Thử lưu lại" manual retry button (EditorLayout) need: force an
  // immediate save and get back its REAL outcome, rather than firing and
  // forgetting like the unmount flush does.
  describe("flush()", () => {
    it("resolves null without any network call when the document is already clean", async () => {
      const { result } = renderHook(() => useAutosave(INVITATION_ID));

      const outcome = await result.current.flush();

      expect(outcome).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the PATCH immediately (bypassing the 2s debounce) and resolves once it succeeds", async () => {
      const { result } = renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      expect(fetchMock).not.toHaveBeenCalled();

      const outcome = await result.current.flush();

      expect(outcome).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().dirty).toBe(false);
      // The pending debounce timer must not ALSO fire afterwards.
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("resolves 'invalid' without sending a PATCH when the document is currently invalid", async () => {
      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      const invalidDoc = { ...createDefaultDocument(), theme: undefined } as unknown as InvitationDocument;
      act(() => {
        useEditorStore.setState({ document: invalidDoc, dirty: true });
      });

      const outcome = await result.current.flush();

      expect(outcome).toBe("invalid");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("resolves 'network' when the flushed PATCH itself fails", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "fail" }) });
      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });

      const outcome = await result.current.flush();

      expect(outcome).toBe("network");
    });

    it("joins an already-in-flight save instead of firing a second CONCURRENT request, then genuinely re-saves once it settles (so the latest document still lands) and resolves with that real outcome", async () => {
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number }> }>((resolve) => {
        resolveFirst = resolve;
      });
      fetchMock.mockImplementationOnce(() => firstResponse);

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().saving).toBe(true);

      // flush() is called WHILE the debounce-triggered save above is still
      // in flight — it must not fire a second CONCURRENT request (no two
      // requests in flight at once — same invariant "serialised saves"
      // above already covers). It's still expected to trigger one real
      // follow-up request once the first settles, exactly like a second
      // edit arriving mid-flight would (this IS that same queuing
      // mechanism) — otherwise flush() couldn't guarantee the document as
      // of the flush call is what actually gets persisted.
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: 222 }) });
      const flushPromise = result.current.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });
      const outcome = await flushPromise;

      expect(outcome).toBeNull();
      // Never more than one request in flight at a time, but two total:
      // the original debounced save, then flush's follow-up once it
      // settled.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBe(222);
    });

    it("does not send a keepalive PATCH again on unmount right after a successful flush (nothing left dirty)", async () => {
      const { result, unmount } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });

      await result.current.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      unmount();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("serialised saves", () => {
    it("queues an edit that arrives mid-flight instead of firing a second concurrent PATCH, sends it immediately once the first settles with the latest document, and never lets the stale first response clear dirty", async () => {
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number }> }>(
        (resolve) => {
          resolveFirst = resolve;
        },
      );
      fetchMock.mockImplementationOnce(() => firstResponse);

      renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // First save is in flight; its response hasn't resolved yet.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().saving).toBe(true);

      // A second edit lands while the first request is still in flight.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // The second edit's debounce elapsed, but a save was already in
      // flight — it must be queued, not fired as an overlapping request.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Queue up the second (fresh) request's response before resolving
      // the first, since the queued retry fires synchronously once the
      // first settles.
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: 222 }) });

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111 }) });
        // Flush the microtask chain: await res.json() -> markSaved/setError
        // -> finally -> queued performSave() -> its own await fetch() ->
        // await res.json().
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      // The queued follow-up fired immediately (no extra debounce delay),
      // carrying the latest document — not the one captured when it was
      // queued.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(secondBody.document.theme.primary).toBe("#222222");

      // The stale first response must not have cleared `dirty` — the edit
      // it raced with wasn't part of what it persisted.
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBe(222);
    });

    it("keeps dirty true while the fresh follow-up request is still in flight after a stale response resolves", async () => {
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number }> }>(
        (resolve) => {
          resolveFirst = resolve;
        },
      );
      let resolveSecond!: (value: { ok: boolean; json: () => Promise<{ savedAt: number }> }) => void;
      const secondResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number }> }>(
        (resolve) => {
          resolveSecond = resolve;
        },
      );
      fetchMock.mockImplementationOnce(() => firstResponse);

      renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      fetchMock.mockImplementationOnce(() => secondResponse);
      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      // Second (fresh) request now in flight; must not be marked saved yet.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().saving).toBe(true);

      await act(async () => {
        resolveSecond({ ok: true, json: async () => ({ savedAt: 222 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBe(222);
    });
  });
});
