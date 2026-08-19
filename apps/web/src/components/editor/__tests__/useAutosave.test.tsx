// @vitest-environment jsdom
import { createDefaultDocument, type InvitationDocument } from "@hpwd/schema";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { useAutosave, type AutosaveErrorKind } from "../useAutosave";

const INVITATION_ID = "inv-123";

function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    version: 0,
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
    json: async () => ({ savedAt: Date.now(), version: 1 }),
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
    // The store's current version travels with every PATCH so the server
    // can detect a write racing against a stale read.
    expect(body.version).toBe(0);
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
    // Same call also confirms the store's version from the response, so the
    // NEXT PATCH (whenever it happens) sends the row's real current version.
    expect(useEditorStore.getState().version).toBe(1);
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
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: Date.now(), version: 1 }) });
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
      // The unmount keepalive flush must carry `version` too — the server
      // has no other way to detect a stale write from an already-closing tab.
      expect(body.version).toBe(0);

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

    // BLOCKER B1, trigger 2 (final review): a still-in-flight save at unmount
    // used to be `abort()`ed before the keepalive flush fired. That doesn't
    // stop the SERVER from committing the aborted request — `route.ts` never
    // consults the abort signal — so the old behavior could leave the row
    // committed at a version this tab never learned, then send the keepalive
    // with the STALE pre-abort version, get an honest 409 for its own write,
    // and drop the newest edit with the tab already gone and nothing left to
    // retry. This test uses a fake server that actually tracks `version`
    // (not a bare fetch spy) so the failure mode — the aborted request
    // landing AFTER the "recovery" — is genuinely modelled, not assumed away.
    it("chains the final write onto a still-in-flight save at unmount instead of aborting it, so the newest edit lands using the version the in-flight save actually produced", async () => {
      let serverVersion = 0;
      function fakeServer(init: RequestInit) {
        const body = JSON.parse(init.body as string) as { version: number };
        if (body.version !== serverVersion) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: "conflict", currentVersion: serverVersion }),
          });
        }
        serverVersion += 1;
        return Promise.resolve({ ok: true, json: async () => ({ savedAt: Date.now(), version: serverVersion }) });
      }

      let resolvePatch1!: () => void;
      const patch1Gate = new Promise<void>((resolve) => {
        resolvePatch1 = resolve;
      });
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        // Holds PATCH#1 "in flight" (on a slow link) until the test lets it
        // through — deliberately AFTER `unmount()` runs, below, to prove the
        // request was never aborted.
        await patch1Gate;
        return fakeServer(init);
      });

      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));

      // Edit v1 -> its debounce fires -> PATCH#1 {v1, version:0} sent and
      // held in flight.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#v1" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Edit v2 arrives before PATCH#1 settles; its own 2s debounce timer is
      // armed but never gets the chance to elapse.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#v2" });
      });

      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => fakeServer(init));

      unmount();

      // Nothing sent yet — PATCH#1 hasn't been let through, and (unlike the
      // old abort-based behavior) unmounting must not fire a second request
      // racing against it.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Now let PATCH#1 commit — on the real server this is the request
      // that would have kept running after an abort() too.
      resolvePatch1();
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      // Exactly one more request: the chained final write, carrying v2 (the
      // newest edit) and the version PATCH#1's own response produced (1) —
      // not the stale 0 both requests would otherwise have raced on.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, finalInit] = fetchMock.mock.calls[1];
      expect(url).toBe(`/api/invitations/${INVITATION_ID}`);
      expect(finalInit.keepalive).toBe(true);
      const finalBody = JSON.parse(finalInit.body as string);
      expect(finalBody.version).toBe(1);
      expect(finalBody.document.theme.primary).toBe("#v2");

      // The fake server itself confirms both writes landed, in order, with
      // nothing rejected: v1 then v2, ending at version 2.
      expect(serverVersion).toBe(2);
    });

    // M1 (final review round 3): `setSaving(true)`/`setSaving(false)` carry
    // no cross-invitation payload — `setSaving(false)` is just the release
    // of a flag THIS call itself set moments earlier. Guarding it with
    // `!unmounted` (like `setVersion`/`markSaved`, which DO carry a
    // payload) would strand the store at `saving: true` forever whenever a
    // save is still in flight at unmount time, since nothing else would
    // ever flip it back — the next invitation's editor to mount would show
    // "Đang lưu…" indefinitely, even ahead of its own error states.
    it("releases the saving flag once an in-flight save settles, even though the hook has already unmounted", async () => {
      let resolvePatch!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const patchResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
        (resolve) => {
          resolvePatch = resolve;
        },
      );
      fetchMock.mockImplementationOnce(() => patchResponse);

      const { unmount } = renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().saving).toBe(true);

      unmount();
      // Still in flight — `saving` must not have been reset just by
      // unmounting (the request itself is still pending).
      expect(useEditorStore.getState().saving).toBe(true);

      resolvePatch({ ok: true, json: async () => ({ savedAt: 999, version: 1 }) });
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      // The now-settled save must have released the flag despite the hook
      // being unmounted — otherwise the NEXT editor to mount on this same
      // module-level store would render a permanent "Đang lưu…".
      expect(useEditorStore.getState().saving).toBe(false);
    });

    // R2 (final review): `useEditorStore` is a SINGLE module-level store
    // shared by every editor route. If invitation A's save is still in
    // flight when its `EditorLayout` unmounts, and invitation B's
    // `EditorLayout` mounts before A's save settles (an ordinary SPA
    // navigation from one invitation straight to another), A's late
    // response must not read or write B's state — it must not clobber B's
    // `version`, must not falsely clear B's `dirty`, and its own final
    // keepalive write must carry A's OWN document/version to A's OWN id,
    // never anything read from the store as it stands by settle time.
    it("a save that settles after this invitation's editor has unmounted must not touch a DIFFERENT invitation's editor now sharing the same store", async () => {
      let resolvePatch1!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const patch1Response = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
        (resolve) => {
          resolvePatch1 = resolve;
        },
      );

      fetchMock.mockImplementationOnce((url: string) => {
        expect(url).toBe("/api/invitations/inv-A");
        return patch1Response;
      });
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/invitations/inv-B") {
          return Promise.resolve({ ok: true, json: async () => ({ savedAt: 222, version: 8 }) });
        }
        if (url === "/api/invitations/inv-A") {
          return Promise.resolve({ ok: true, json: async () => ({ savedAt: 333, version: 2 }) });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });

      const hookA = renderHook(() => useAutosave("inv-A"));

      // Edit #A1 -> debounce -> PATCH#1 to inv-A fires and is held pending.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A1" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Edit #A2 arrives before unmount; its own debounce is armed but
      // never gets the chance to elapse.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A2" });
      });

      hookA.unmount();
      // Nothing new sent yet — PATCH#1 is still held.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Invitation B's `EditorLayout` now mounts on the SAME module-level
      // store — exactly what a real SPA navigation from A straight to B
      // does (`setDocument` runs in B's own effect before B's `useAutosave`
      // effect body runs, same ordering as a real mount).
      act(() => {
        useEditorStore.getState().setDocument(createDefaultDocument(), 7);
      });
      const hookB = renderHook(() => useAutosave("inv-B"));

      // The couple types into B.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#B-EDIT" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      // B's own debounced save fires and succeeds, legitimately bumping the
      // shared store's version to 8.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().version).toBe(8);
      expect(useEditorStore.getState().dirty).toBe(false);

      // NOW invitation A's stale PATCH#1 — sent long before B ever
      // existed — finally resolves.
      resolvePatch1({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      // B's state must be completely untouched by A's late response:
      // neither a clobbered version, nor a falsely-cleared dirty flag.
      expect(useEditorStore.getState().version).toBe(8);
      expect(useEditorStore.getState().dirty).toBe(false);

      // A's own chained final write (fired once PATCH#1 settled) must
      // target invitation A, with A's OWN confirmed version (1, from
      // PATCH#1's own response) and A's OWN document (captured at unmount
      // time — "#A2" — never read from the now-B-owned shared store).
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const [urlThird, initThird] = fetchMock.mock.calls[2];
      expect(urlThird).toBe("/api/invitations/inv-A");
      const bodyThird = JSON.parse(initThird.body as string);
      expect(bodyThird.version).toBe(1);
      expect(bodyThird.document.theme.primary).toBe("#A2");

      hookB.unmount();
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
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>((resolve) => {
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
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: 222, version: 2 }) });
      const flushPromise = result.current.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
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
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
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
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: 222, version: 2 }) });

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
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
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
        (resolve) => {
          resolveFirst = resolve;
        },
      );
      let resolveSecond!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const secondResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
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
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      // Second (fresh) request now in flight; must not be marked saved yet.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().saving).toBe(true);

      await act(async () => {
        resolveSecond({ ok: true, json: async () => ({ savedAt: 222, version: 2 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().lastSavedAt).toBe(222);
    });
  });

  // The two-tab data-loss bug this whole task exists to close: the server
  // rejects a stale-version write with 409. The autosave hook's job on that
  // response is to stop completely, not to paper over it with a retry —
  // retrying would silently perform the exact overwrite the version check
  // was there to prevent.
  describe("409 conflict handling", () => {
    it("sets error to 'conflict', leaves dirty true, does not markSaved, and never sends another PATCH even as the user keeps typing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "Thiệp đã được chỉnh sửa ở nơi khác.", currentVersion: 5 }),
      });

      const { result } = renderHook(() => useAutosave(INVITATION_ID));

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(useEditorStore.getState().saving).toBe(false);

      // The couple keeps typing after the conflict — a real editor session
      // wouldn't just freeze. None of it may reach the server: the whole
      // point of stopping is that any further write from this stale tab
      // would itself be exactly the overwrite being guarded against.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");
    });

    it("does not resolve the conflict via an explicit flush() either", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "conflict", currentVersion: 5 }),
      });

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");

      const outcome = await result.current.flush();

      expect(outcome).toBe("conflict");
      // flush() must not have fired a second network request once conflicted.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // R3 (final review): a 409 status IS positive proof this specific send
    // did NOT commit — unlike a transport failure, there is nothing
    // "unknown" about the outcome, even if the body happens to be
    // unparsable. Misclassifying it as `"network"` (the pre-fix behavior,
    // since a `res.json()` throw fell into the same shared `catch` as a
    // genuine transport failure) would wrongly mark this send as
    // "unconfirmed" — feeding the NEXT save's reconciliation logic a false
    // premise it could later act on. The observable, load-bearing
    // difference between the two error kinds is whether the hook ever
    // retries on its own: `"network"` does not latch (typing again later
    // sends another PATCH), `"conflict"` latches for good.
    it("treats a 409 with an unparsable body as a conflict (latched), never as a network failure (which would NOT latch)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      });

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");

      // If this had been misclassified as "network", the next edit would
      // trigger a second PATCH (network failures don't latch — see the
      // "client-side validation" and top-level `AutosaveErrorKind` doc
      // comment). A genuine conflict must not.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");
    });
  });

  // A minimal fake server that tracks BOTH `version` and `document` (unlike
  // a bare fetch spy, which can't tell "our write landed" apart from "a
  // foreign write landed" — both just look like "the version moved"). Used
  // by the reconciliation tests below: R1 (final review) requires verifying
  // a reconciliation against the server's actual document, not just
  // trusting version arithmetic, so these tests must model a server that
  // actually HAS a document to compare against.
  function createFakeInvitationServer(initialVersion: number, initialDocument: unknown) {
    let version = initialVersion;
    let document = initialDocument;
    return {
      get version() {
        return version;
      },
      get document() {
        return document;
      },
      /** Simulates a write from a COMPLETELY DIFFERENT session — never goes through this tab's own `fetch`. */
      applyForeignWrite(newDocument: unknown) {
        document = newDocument;
        version += 1;
      },
      /** Simulates "the PATCH actually committed on the server, but this tab's fetch() call itself rejects" — Trigger 1's exact scenario. */
      commitAsIfPatchSucceeded(newDocument: unknown) {
        document = newDocument;
        version += 1;
      },
      handle(_url: string, init?: RequestInit) {
        if (!init || init.method === undefined) {
          // GET /api/invitations/[id] — used by the hook's own verification
          // step to check what the server actually has.
          return Promise.resolve({ ok: true, json: async () => ({ invitation: { document, version } }) });
        }
        const body = JSON.parse(init.body as string) as { document?: unknown; version: number };
        if (body.version !== version) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: "conflict", currentVersion: version }),
          });
        }
        if (body.document !== undefined) document = body.document;
        version += 1;
        return Promise.resolve({ ok: true, json: async () => ({ savedAt: Date.now(), version }) });
      },
    };
  }

  // BLOCKER B1 (final review, round 2 — R1): `Invitation.version` is bumped
  // by exactly one place in the whole app, so "the row's version moved by
  // exactly one" does not by itself mean ANOTHER session wrote — it can
  // equally mean THIS tab's own prior write committed but its response was
  // lost. Version arithmetic alone cannot tell the two apart (both produce
  // an identical `currentVersion`), so the hook must VERIFY — via a `GET`
  // compared against the payload that went out unconfirmed — rather than
  // infer. These tests prove both directions: (a) our write really did
  // land, verification confirms it, reconcile and persist; (b) our write
  // never landed and a genuine foreign write did, verification catches the
  // mismatch, latch — and the foreign write survives untouched (this exact
  // interleaving was the round-1 regression the coordinator's re-review
  // found: version arithmetic alone accepted it and silently destroyed the
  // foreign write).
  describe("reconciling a 409 against this tab's own unconfirmed write (verified, not inferred)", () => {
    it("(a) recovers on the NEXT save after its own commit-but-response-lost failure, instead of latching a false conflict forever", async () => {
      const server = createFakeInvitationServer(0, useEditorStore.getState().document);
      fetchMock.mockImplementation((url: string, init?: RequestInit) => server.handle(url, init));

      // Attempt 1: the PATCH actually reaches and commits on the server
      // (the fake server is updated accordingly), but THIS tab's fetch()
      // call itself rejects — the response never arrives cleanly.
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        server.commitAsIfPatchSucceeded(body.document);
        return Promise.reject(new TypeError("Failed to fetch"));
      });

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("network");
      expect(useEditorStore.getState().dirty).toBe(true);
      // The store never learned attempt 1 actually committed — it's still
      // holding the PRE-write version, even though the fake server is
      // already at version 1.
      expect(useEditorStore.getState().version).toBe(0);
      expect(server.version).toBe(1);

      // The couple keeps typing. This tab still only knows version 0, so it
      // sends that — the server (having actually committed attempt 1) is
      // really at version 1, and correctly says so via 409. The hook must
      // then VERIFY (a GET) before trusting that gap, find the server's
      // document matches EXACTLY what attempt 1 sent, and only then
      // reconcile and re-send the "#222222" edit.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      // Four real network calls: PATCH (rejects), PATCH (409), GET
      // (verify), PATCH (resend, succeeds).
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.current.error).toBeNull();
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().version).toBe(2);
      // The fake server itself confirms the FULL, correct history landed:
      // attempt 1's content, then the "#222222" edit — nothing lost,
      // nothing duplicated.
      expect(server.version).toBe(2);
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#222222");
    });

    // Reproduces the coordinator re-review's exact interleaving: this is
    // the scenario the round-1 (version-arithmetic-only) reconciliation got
    // WRONG — it satisfied `currentVersion === unconfirmedVersion + 1` here
    // too, adopted the version, and silently overwrote the partner's write.
    it("(b) still latches a GENUINE cross-session conflict — and the OTHER session's write survives untouched — even though the version gap looks identical to (a)", async () => {
      const server = createFakeInvitationServer(0, useEditorStore.getState().document);
      fetchMock.mockImplementation((url: string, init?: RequestInit) => server.handle(url, init));

      // A edits — but this time the PATCH genuinely never reaches the
      // server at all (no `commitAsIfPatchSucceeded`): the fake server
      // stays at version 0 with the ORIGINAL document.
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A-EDIT" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.error).toBe("network");
      expect(server.version).toBe(0);

      // The partner's phone saves once, for real, against the SAME
      // invitation — a completely different session, never touching this
      // tab's `fetch`.
      server.applyForeignWrite({ ...useEditorStore.getState().document, theme: { primary: "#PARTNER" } });
      expect(server.version).toBe(1);

      // A types again. This tab still only knows version 0, so it sends
      // that — the server is at version 1, so this gets a 409 with
      // `currentVersion: 1`. That gap is IDENTICAL, in shape, to (a)'s.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A2" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      // The hook's verification GET must have found the server's document
      // is "#PARTNER" — NOT the "#A-EDIT" this tab's unconfirmed send
      // actually contained — so it must NOT reconcile: exactly three calls
      // (PATCH reject, PATCH 409, GET verify), no resend.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe("conflict");

      // The whole point: the partner's write is NOT silently gone.
      expect(server.version).toBe(1);
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#PARTNER");

      // And it stays latched: further edits never reach the server.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A3" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe("conflict");
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#PARTNER");
    });

    // M2 (final review round 3): the rewritten (b) above uses a version gap
    // of exactly one, same as (a) — the GET/deepEqual check is what tells
    // them apart there, so (b) alone no longer pins the
    // `currentVersion === unconfirmedSend.version + 1` arithmetic itself
    // (relaxing it to e.g. `>` still passes (b), since the documents still
    // correctly mismatch). This test isolates that clause: a gap that
    // ISN'T exactly one write must not even ATTEMPT verification — proven
    // by asserting the GET call itself never fires, not just that the
    // eventual outcome is a latch.
    it("(pinning the arithmetic) a version gap that is not exactly one write never even attempts the verification GET", async () => {
      const server = createFakeInvitationServer(0, useEditorStore.getState().document);
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.error).toBe("network");
      expect(server.version).toBe(0);

      // TWO unrelated foreign writes land — a gap of two, not one.
      fetchMock.mockImplementation((url: string, init?: RequestInit) => server.handle(url, init));
      server.applyForeignWrite({ ...useEditorStore.getState().document, theme: { primary: "#FOREIGN-1" } });
      server.applyForeignWrite({ ...useEditorStore.getState().document, theme: { primary: "#FOREIGN-2" } });
      expect(server.version).toBe(2);

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A2" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      // Exactly two calls total: the original PATCH (rejects) and the
      // second PATCH (409, currentVersion 2). A THIRD call — the
      // verification GET — must never fire: `unconfirmedSend.version + 1`
      // is 1, not 2, so the arithmetic clause alone must reject this
      // before verification is even considered. If that clause were
      // loosened to anything weaker (e.g. `currentVersion >
      // unconfirmedSend.version`), a GET would fire here.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe("conflict");
      expect(server.version).toBe(2);
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#FOREIGN-2");
    });

    // The reviewer's own hand-written case: verification isn't just about
    // a document mismatch — the GET itself can fail (this tab going
    // offline again right as it tries to check). That must ALSO fail
    // closed (latch), never be treated as "nothing to disprove it, so
    // proceed."
    it("latches (fails closed) when the verification GET itself fails, even though the version gap looks exactly like this tab's own write", async () => {
      const server = createFakeInvitationServer(0, useEditorStore.getState().document);
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A-EDIT" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.error).toBe("network");

      // A foreign write lands — a gap of exactly one, so the hook WOULD
      // attempt verification...
      server.applyForeignWrite({ ...useEditorStore.getState().document, theme: { primary: "#PARTNER" } });
      expect(server.version).toBe(1);

      // ...but the verification GET itself fails to reach the server.
      // Every OTHER call (the second PATCH) still hits the real fake
      // server normally.
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (!init) {
          // A GET has no `init` at all in this hook's own `fetch(url)` call
          // — see `fetchServerInvitationState`.
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return server.handle(url, init);
      });

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A2" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      // Three calls: PATCH (rejects), PATCH (409), GET (also rejects) — no
      // fourth, resend call. An inconclusive verification must never be
      // treated as permission to proceed.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe("conflict");
      // The partner's write survives untouched.
      expect(server.version).toBe(1);
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#PARTNER");

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#A3" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("gives up and latches if the automatic re-send itself ALSO gets a 409 (at most one re-send, and at most one verification GET, per save cycle)", async () => {
      const server = createFakeInvitationServer(0, useEditorStore.getState().document);
      fetchMock.mockImplementation((url: string, init?: RequestInit) => server.handle(url, init));
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        server.commitAsIfPatchSucceeded(body.document);
        return Promise.reject(new TypeError("Failed to fetch"));
      });

      const { result } = renderHook(() => useAutosave(INVITATION_ID));
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.error).toBe("network");
      expect(server.version).toBe(1);

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      // Right as the re-send (triggered by a verified reconciliation) is
      // about to go out, a SECOND, unrelated session sneaks in a write —
      // so the re-send itself also gets a 409.
      let resendAttempted = false;
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(init.body as string) as { version: number }) : undefined;
        if (!resendAttempted && body?.version === 1) {
          resendAttempted = true;
          server.applyForeignWrite({ ...useEditorStore.getState().document, theme: { primary: "#SECOND-SESSION" } });
        }
        return server.handle(url, init);
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      // Exactly one verification GET and one re-send attempt — the second
      // 409 must NOT trigger a second verification round.
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.current.error).toBe("conflict");
      expect(server.version).toBe(2);
      expect((server.document as { theme: { primary: string } }).theme.primary).toBe("#SECOND-SESSION");

      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#444444" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // Proves the "revision guard" (which correctly protects `markSaved` from a
  // stale response) must NOT also gate `setVersion`. If it did, a slow first
  // save whose response arrives after a second edit was already queued would
  // leave the store holding the pre-increment version — so the very next
  // (legitimate, same-tab) save would send that stale version and get a
  // FALSE 409 from the server, purely from racing against itself.
  describe("version tracking survives the stale-response race", () => {
    it("updates the store's version from a response even when a newer edit arrived first (so the queued follow-up save doesn't falsely conflict)", async () => {
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
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
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // A second edit lands while the first request is still in flight —
      // its own debounce elapses too, so it's queued (serialised saves).
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The queued follow-up (for the second edit) must be sent with the
      // server's real post-increment version (1), not the stale 0 the store
      // held before the first response landed.
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        expect(body.version).toBe(1);
        return Promise.resolve({ ok: true, json: async () => ({ savedAt: 222, version: 2 }) });
      });

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().version).toBe(2);
    });
  });

  // Coordinator review fix: before this, `PublishDialog`'s badge toggle
  // PATCHed `/api/invitations/[id]` with its OWN independent `fetch`,
  // reading `version` straight off the store. Once every successful PATCH
  // bumps that shared row `version` (Task 1), two independent writers could
  // race: type in the editor (arms the 2s debounce), then flip the badge
  // toggle before it fires — both read the same `version`, the faster one
  // commits, and the slower one gets a real 409 from the server that LOOKS
  // exactly like a cross-tab conflict but isn't one, permanently halting
  // autosave over nothing. `saveSettings` (below) closes this by routing
  // the settings write through the exact same serialised queue
  // (`inFlight`/`pendingAgain`/`waiters`) and the exact same
  // `versionAtSend`/`setVersion` bookkeeping the document write already
  // uses, so there is only ever one writer.
  describe("settings save shares the writer with document autosave", () => {
    it("does not falsely conflict when a settings save is triggered while a document autosave is in flight — both writes land, error stays null, and conflicted is never set", async () => {
      let resolveFirst!: (value: { ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }) => void;
      const firstResponse = new Promise<{ ok: boolean; json: () => Promise<{ savedAt: number; version: number }> }>(
        (resolve) => {
          resolveFirst = resolve;
        },
      );
      fetchMock.mockImplementationOnce(() => firstResponse);

      const { result } = renderHook(() => useAutosave(INVITATION_ID));

      // Document autosave arms and fires first (v0 -> in flight).
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#111111" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(firstBody.version).toBe(0);
      expect(firstBody.settings).toBeUndefined();

      // The badge toggle fires WHILE that document save is still in flight
      // — before the fix, this is exactly where PublishDialog would have
      // sent its own competing PATCH reading the same (still-0) version.
      let settingsOutcome: AutosaveErrorKind | undefined;
      const settingsPromise = result.current.saveSettings({ showBadge: false }).then((outcome) => {
        settingsOutcome = outcome;
      });
      // Queued behind the in-flight request, not a second concurrent one.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The queued follow-up must carry the server's real post-increment
      // version AND combine both the document and the settings into one
      // request — proof this really is one writer, not two coordinating by
      // luck.
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        expect(body.version).toBe(1);
        expect(body.settings).toEqual({ showBadge: false });
        expect(body.document.theme.primary).toBe("#111111");
        return Promise.resolve({ ok: true, json: async () => ({ savedAt: 222, version: 2 }) });
      });

      await act(async () => {
        resolveFirst({ ok: true, json: async () => ({ savedAt: 111, version: 1 }) });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });
      await settingsPromise;

      // Both writes landed (two real requests, both successful), the
      // settings caller got a truthful "saved" outcome, and nothing here
      // ever looked like a conflict.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(settingsOutcome).toBeNull();
      expect(result.current.error).toBeNull();
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useEditorStore.getState().version).toBe(2);

      // `conflicted` was never set: a further, unrelated edit still
      // autosaves completely normally afterward.
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ savedAt: 333, version: 3 }) });
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#333333" });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBeNull();
    });

    it("a genuine cross-tab 409 still sets conflicted and stops retrying, even with a settings save queued behind it (the new queueing does not weaken the real guard)", async () => {
      let resolveFirst!: (value: {
        ok: boolean;
        status: number;
        json: () => Promise<{ error: string; currentVersion: number }>;
      }) => void;
      const firstResponse = new Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<{ error: string; currentVersion: number }>;
      }>((resolve) => {
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

      // Settings save queued behind the in-flight (about-to-conflict)
      // document save.
      let settingsOutcome: AutosaveErrorKind | undefined;
      const settingsPromise = result.current.saveSettings({ showBadge: false }).then((outcome) => {
        settingsOutcome = outcome;
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The in-flight request turns out to be a GENUINE cross-tab conflict
      // — this tab's version really is behind, unrelated to the settings
      // save that happened to be queued behind it.
      await act(async () => {
        resolveFirst({
          ok: false,
          status: 409,
          json: async () => ({ error: "Thiệp đã được chỉnh sửa ở nơi khác.", currentVersion: 5 }),
        });
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });
      await settingsPromise;

      // The queueing must NOT have weakened the real guard: no second
      // request (the queued settings save must not have been retried once
      // the conflict was known), `conflicted` state set, and the queued
      // caller told the truth about the outcome instead of silently
      // looking like it succeeded.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("conflict");
      expect(settingsOutcome).toBe("conflict");

      // Further typing AND further saveSettings calls both stay inert —
      // "stops retrying" now applies to both writers sharing one guard.
      act(() => {
        useEditorStore.getState().updateTheme({ primary: "#222222" });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const secondOutcome = await result.current.saveSettings({ showBadge: true });
      expect(secondOutcome).toBe("conflict");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
