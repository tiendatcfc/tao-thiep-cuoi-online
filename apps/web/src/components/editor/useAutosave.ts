"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Subscribes to the editor store and PATCHes the document to
 * `/api/invitations/[id]` 2s after it goes idle following a mutation.
 * Debounced on `document` reference changes (every mutating store action
 * produces a new `document` object) rather than on `dirty`'s rising edge —
 * `dirty` stays `true` across a failed save, so watching only its
 * false→true transition would never re-arm the timer for the "edit again
 * after a failure" retry case the brief calls for.
 *
 * Returns `{ error }` so the header (Task 15's `EditorLayout`) can show the
 * Vietnamese "Lưu thất bại" state — that's not representable from the
 * store's own `dirty`/`saving`/`lastSavedAt` alone, since "waiting out the
 * debounce" and "the last attempt failed" look identical in store state.
 */
export function useAutosave(invitationId: string) {
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPendingTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    async function save() {
      const { document } = useEditorStore.getState();
      useEditorStore.getState().setSaving(true);
      try {
        const res = await fetch(`/api/invitations/${invitationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document }),
        });
        if (!res.ok) throw new Error(`Autosave failed with status ${res.status}`);
        const body = (await res.json()) as { savedAt?: number };
        useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
        setError(false);
      } catch {
        // Leave `dirty: true` — the next mutation re-arms the debounce
        // timer below, so this isn't a dead end. No retry loop is started
        // here: without a further edit, nothing calls `save()` again.
        setError(true);
      } finally {
        useEditorStore.getState().setSaving(false);
      }
    }

    function scheduleSave() {
      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    if (useEditorStore.getState().dirty) {
      scheduleSave();
    }

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (state.document !== prevState.document && state.dirty) {
        scheduleSave();
      }
    });

    // `navigator.sendBeacon` only ever sends a POST, and this route only
    // accepts PATCH — adding a second beacon-flavored endpoint just for the
    // unload edge case isn't "straightforward" per the brief, so this falls
    // back to the standard browser confirmation prompt instead, which at
    // least stops the couple's edits from being silently lost.
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
    };
  }, [invitationId]);

  return { error };
}
