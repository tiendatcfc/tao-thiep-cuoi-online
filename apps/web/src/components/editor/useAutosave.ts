"use client";

import { InvitationDocumentSchema, type InvitationDocument } from "@hpwd/schema";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * `null` — nothing to report (idle, or the last attempt succeeded).
 * `"network"` — the PATCH itself failed (offline, 5xx, ...); safe to keep
 * retrying as-is, so the header keeps its "sẽ thử lại" wording.
 * `"invalid"` — the document fails `InvitationDocumentSchema` client-side.
 * Whole-document validation means one bad field anywhere blocks the entire
 * save on every retry forever, so this gets its own distinct message
 * instead of being lumped in with "network failed, will retry".
 */
export type AutosaveErrorKind = "network" | "invalid" | null;

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
 * Two durability/correctness properties beyond the basic debounce:
 *
 * 1. **Flush on unmount.** A Next.js client-side route change or the Back
 *    button unmounts this hook WITHOUT firing `beforeunload` (that only
 *    fires on an actual page unload) — the ordinary way someone leaves
 *    `/editor/[id]`. Without an unmount flush, a debounce still pending at
 *    that moment silently drops the couple's last edits. The flush is
 *    fire-and-forget with `keepalive: true` (so it also survives a real
 *    page unload, if that's what triggered the unmount) — nothing here can
 *    react to its result after teardown anyway.
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
 * Returns `{ error }` so the header (`EditorLayout`) can show the Vietnamese
 * failure state — not representable from the store's own
 * `dirty`/`saving`/`lastSavedAt` alone, since "waiting out the debounce"
 * and "the last attempt failed" look identical in store state.
 */
export function useAutosave(invitationId: string) {
  const [error, setError] = useState<AutosaveErrorKind>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let inFlight = false;
    let pendingAgain = false;
    let revision = 0;

    function clearPendingTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    async function performSave() {
      if (inFlight) {
        // Something is already in flight — don't fire a second, overlapping
        // request (the server does a plain last-write-wins overwrite with
        // no concurrency control, so two in-flight requests can complete
        // out of order and silently revert to the older one). Run again,
        // immediately, once the current one settles.
        pendingAgain = true;
        return;
      }

      const document = useEditorStore.getState().document;
      const parsed = InvitationDocumentSchema.safeParse(document);
      if (!parsed.success) {
        setError("invalid");
        return;
      }

      inFlight = true;
      const revisionAtSend = revision;
      useEditorStore.getState().setSaving(true);
      try {
        const res = await fetch(...buildInvitationPatchRequest(invitationId, document));
        if (!res.ok) throw new Error(`Autosave failed with status ${res.status}`);
        const body = (await res.json()) as { savedAt?: number };
        // If a newer edit landed while this request was in flight, this
        // response reflects an older document — it must not clear `dirty`,
        // or the newer edit would silently look "saved" when it isn't yet.
        if (revision === revisionAtSend) {
          useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
        }
        setError(null);
      } catch {
        // Leave `dirty: true` — the next mutation re-arms the debounce
        // timer below, so this isn't a dead end. No retry loop is started
        // here: without a further edit, nothing calls `performSave()` again.
        setError("network");
      } finally {
        useEditorStore.getState().setSaving(false);
        inFlight = false;
        if (pendingAgain) {
          pendingAgain = false;
          void performSave();
        }
      }
    }

    function scheduleSave() {
      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

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

      // See "Flush on unmount" above: `beforeunload` doesn't cover the
      // ordinary SPA-navigation-away-from-the-editor case, so a still-dirty
      // document gets one last best-effort save attempt here instead of
      // being silently dropped.
      const { dirty, document } = useEditorStore.getState();
      if (dirty && InvitationDocumentSchema.safeParse(document).success) {
        fetch(...buildInvitationPatchRequest(invitationId, document, { keepalive: true })).catch(() => {});
      }
    };
  }, [invitationId]);

  return { error };
}
