"use client";

import { InvitationDocumentSchema, type InvitationDocument } from "@hpwd/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * `null` — nothing to report (idle, or the last attempt succeeded).
 * `"network"` — the PATCH itself failed (offline, 5xx, ...). No automatic
 * retry loop runs on its own (see `performSave`'s comment) — the header
 * shows a manual "Thử lưu lại" action (`flush`, below) instead of claiming
 * one will happen by itself.
 * `"invalid"` — the document fails `InvitationDocumentSchema` client-side.
 * Whole-document validation means one bad field anywhere blocks the entire
 * save on every retry forever, so this gets its own distinct message
 * instead of being lumped in with "network failed".
 */
export type AutosaveErrorKind = "network" | "invalid" | null;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function buildInvitationPatchRequest(
  invitationId: string,
  document: InvitationDocument,
  extra?: RequestInit,
): [string, RequestInit] {
  return [
    `/api/invitations/${invitationId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document }),
      ...extra,
    },
  ];
}

/**
 * Subscribes to the editor store and PATCHes the document to
 * `/api/invitations/[id]` 2s after it goes idle following a mutation.
 * Debounced on `document` reference changes (every mutating store action
 * produces a new `document` object) rather than on `dirty`'s rising edge —
 * `dirty` stays `true` across a failed save, so watching only its
 * false→true transition would never re-arm the timer for the "edit again
 * after a failure" retry case.
 *
 * Three durability/correctness properties beyond the basic debounce:
 *
 * 1. **Flush on unmount.** A Next.js client-side route change or the Back
 *    button unmounts this hook WITHOUT firing `beforeunload` (that only
 *    fires on an actual page unload) — the ordinary way someone leaves
 *    `/editor/[id]`. Without an unmount flush, a debounce still pending at
 *    that moment silently drops the couple's last edits. The flush is
 *    fire-and-forget with `keepalive: true` (so it also survives a real
 *    page unload, if that's what triggered the unmount) — nothing here can
 *    react to its result after teardown anyway. If a save is already in
 *    flight at unmount time, it's `abort()`ed first: otherwise that older
 *    request and the flush's newer one would both be in flight at once,
 *    and the server (last-write-wins, no ordering guarantee) could apply
 *    the older one *after* the newer one — silently reverting to stale
 *    content with the tab already closed and nothing left to retry.
 *
 * 2. **Serialised saves.** Requests are never sent concurrently: if a save
 *    is requested while one is already in flight, it's queued
 *    (`pendingAgain`) instead of firing a second overlapping request, and
 *    runs immediately (no extra debounce wait) once the in-flight one
 *    settles, against whatever the document looks like *then* — not
 *    whatever it looked like when it was queued. A monotonic `revision`
 *    counter (bumped whenever `document` changes) guards `markSaved`: if a
 *    newer edit arrived while a request was in flight, that request's
 *    (now-stale) success response must not clear `dirty`, since the edit it
 *    raced with was never part of what got persisted.
 *
 * 3. **Explicit flush.** `flush()` (returned below) lets a caller — the
 *    "Thử lưu lại" retry button, and `PublishDialog` before it publishes
 *    (see C2: publishing used to snapshot whatever the DB already had,
 *    which can be up to `AUTOSAVE_DEBOUNCE_MS` behind the live editor) —
 *    force an immediate save and `await` its real outcome, including when
 *    one was already in flight: it joins the existing attempt (and any
 *    attempt queued after it) rather than firing a second overlapping
 *    request, and resolves once a save reflecting the CURRENT document has
 *    actually settled.
 *
 * Returns `{ error, flush }` so the header (`EditorLayout`) can show the
 * Vietnamese failure state — not representable from the store's own
 * `dirty`/`saving`/`lastSavedAt` alone, since "waiting out the debounce"
 * and "the last attempt failed" look identical in store state.
 */
export function useAutosave(invitationId: string) {
  const [error, setError] = useState<AutosaveErrorKind>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reassigned on every effect run (below) to close over that run's local
  // save-cycle state; `flush` (a stable callback) always calls whatever
  // this currently points at.
  const flushRef = useRef<() => Promise<AutosaveErrorKind>>(async () => null);

  useEffect(() => {
    let inFlight = false;
    let pendingAgain = false;
    let revision = 0;
    let activeAbortController: AbortController | null = null;
    // Resolved once a save cycle — including any `pendingAgain` rerun
    // chained after it — truly settles with nothing left queued. `flush()`
    // joins this instead of firing its own overlapping request when a save
    // is already in flight.
    let waiters: Array<(result: AutosaveErrorKind) => void> = [];

    function clearPendingTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function resolveWaiters(result: AutosaveErrorKind) {
      const toResolve = waiters;
      waiters = [];
      toResolve.forEach((resolve) => resolve(result));
    }

    async function performSave(): Promise<AutosaveErrorKind> {
      if (inFlight) {
        // Something is already in flight — don't fire a second, overlapping
        // request (the server does a plain last-write-wins overwrite with
        // no concurrency control, so two in-flight requests can complete
        // out of order and silently revert to the older one). Run again,
        // immediately, once the current one settles, and resolve THIS
        // call's promise once that (or a further chained rerun) truly
        // settles — see `resolveWaiters`.
        pendingAgain = true;
        return new Promise<AutosaveErrorKind>((resolve) => {
          waiters.push(resolve);
        });
      }

      const document = useEditorStore.getState().document;
      const parsed = InvitationDocumentSchema.safeParse(document);
      if (!parsed.success) {
        setError("invalid");
        resolveWaiters("invalid");
        return "invalid";
      }

      inFlight = true;
      const revisionAtSend = revision;
      const controller = new AbortController();
      activeAbortController = controller;
      useEditorStore.getState().setSaving(true);
      let result: AutosaveErrorKind = null;
      try {
        const res = await fetch(
          ...buildInvitationPatchRequest(invitationId, document, { signal: controller.signal }),
        );
        if (!res.ok) throw new Error(`Autosave failed with status ${res.status}`);
        const body = (await res.json()) as { savedAt?: number };
        // If a newer edit landed while this request was in flight, this
        // response reflects an older document — it must not clear `dirty`,
        // or the newer edit would silently look "saved" when it isn't yet.
        if (revision === revisionAtSend) {
          useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
        }
        setError(null);
      } catch (err) {
        // An abort is deliberate (the unmount flush below cancels an
        // in-flight save on purpose) — not a real failure, so it must not
        // be reported as one.
        if (!isAbortError(err)) {
          // Leave `dirty: true` — the next mutation, OR an explicit
          // `flush()` (the "Thử lưu lại" button), re-arms this. No
          // automatic retry loop is started here: without one of those,
          // nothing calls `performSave()` again.
          setError("network");
          result = "network";
        }
      } finally {
        useEditorStore.getState().setSaving(false);
        inFlight = false;
        if (activeAbortController === controller) {
          activeAbortController = null;
        }
        if (pendingAgain) {
          pendingAgain = false;
          // The waiters queued above (including any `flush()` callers) are
          // resolved by THIS rerun's own settle, not by the call that's
          // returning right now.
          void performSave();
        } else {
          resolveWaiters(result);
        }
      }
      return result;
    }

    function scheduleSave() {
      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    flushRef.current = async () => {
      clearPendingTimer();
      // Nothing pending and nothing in flight — the last attempt (if any)
      // already succeeded, or there were never any edits. Report success
      // without a wasted network round trip.
      if (!inFlight && !useEditorStore.getState().dirty) {
        return null;
      }
      return performSave();
    };

    if (useEditorStore.getState().dirty) {
      scheduleSave();
    }

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (state.document !== prevState.document) {
        revision += 1;
        if (state.dirty) {
          scheduleSave();
        }
      }
    });

    // `navigator.sendBeacon` only ever sends a POST, and this route only
    // accepts PATCH — adding a second beacon-flavored endpoint just for the
    // unload edge case isn't "straightforward" per the brief, so this falls
    // back to the standard browser confirmation prompt instead, which at
    // least stops the couple's edits from being silently lost when the
    // browser tab/window itself actually closes.
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!useEditorStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearPendingTimer();
      unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushRef.current = async () => null;

      // See "Flush on unmount" above: a save already in flight can't be
      // un-sent, but it CAN be aborted — without this, the flush below
      // would race an older in-flight write against a newer one. Clearing
      // `pendingAgain` first stops the aborted call's own `finally` block
      // from re-firing a save of its own once it settles; the flush right
      // after is this hook's one, sole, superseding save attempt.
      if (activeAbortController) {
        pendingAgain = false;
        activeAbortController.abort();
        activeAbortController = null;
      }

      // `beforeunload` doesn't cover the ordinary SPA-navigation-away-from-
      // the-editor case, so a still-dirty document gets one last
      // best-effort save attempt here instead of being silently dropped.
      const { dirty, document } = useEditorStore.getState();
      if (dirty && InvitationDocumentSchema.safeParse(document).success) {
        fetch(...buildInvitationPatchRequest(invitationId, document, { keepalive: true })).catch(() => {});
      }
    };
  }, [invitationId]);

  const flush = useCallback((): Promise<AutosaveErrorKind> => flushRef.current(), []);

  return { error, flush };
}
