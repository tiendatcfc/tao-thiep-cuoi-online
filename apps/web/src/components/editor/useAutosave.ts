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
 * `"conflict"` — the server rejected the PATCH with 409: this tab's
 * `version` is behind (another tab, or this same tab left open elsewhere,
 * saved in between). Unlike `"network"`, this is terminal for the rest of
 * this hook instance — see `performSave`'s `conflicted` flag below for why
 * retrying is never attempted.
 */
export type AutosaveErrorKind = "network" | "invalid" | "conflict" | null;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** Shape of the `settings` write PublishDialog's badge toggle needs — kept minimal (just what exists today) rather than the full `{showBadge: boolean}` settings schema, since nothing else currently PATCHes `settings` through this hook. */
export type SettingsPayload = { showBadge: boolean };

function buildInvitationPatchRequest(
  invitationId: string,
  version: number,
  payload: { document?: InvitationDocument; settings?: SettingsPayload },
  extra?: RequestInit,
): [string, RequestInit] {
  return [
    `/api/invitations/${invitationId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // `payload`'s keys are `undefined` when there's nothing of that kind
      // to send (e.g. no pending settings write) — `JSON.stringify` drops
      // `undefined`-valued keys entirely, so this never sends a spurious
      // `"settings": undefined` that would fail the route's schema.
      body: JSON.stringify({ ...payload, version }),
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
 * 4. **Settings share the same writer.** `saveSettings` (returned below)
 *    lets `PublishDialog`'s badge toggle PATCH `{settings}` through this
 *    SAME serialised queue and the SAME `version` bookkeeping, instead of
 *    firing its own independent `fetch`. Before optimistic concurrency,
 *    document and settings writes were safely independent — Prisma's
 *    `update` only touches columns named in `data`, so the two could never
 *    collide. Once every successful PATCH bumps the shared row `version`
 *    (Task 1), two writers reading/sending `version` independently can race:
 *    a settings save and a document save armed at the same time would both
 *    read the same `versionAtSend`, the faster one commits and bumps
 *    `version`, and the slower one gets a **false** 409 — a same-tab
 *    "conflict" with no other tab involved, which then permanently stops
 *    autosave (see `conflicted` below) over nothing. Routing `saveSettings`
 *    through `performSave` means there is exactly one in-flight write at a
 *    time and exactly one place that reads/updates `version`, so this race
 *    cannot happen structurally rather than being patched over with retries.
 *
 * Returns `{ error, flush, saveSettings }` so the header (`EditorLayout`)
 * can show the Vietnamese failure state — not representable from the
 * store's own `dirty`/`saving`/`lastSavedAt` alone, since "waiting out the
 * debounce" and "the last attempt failed" look identical in store state.
 */
export function useAutosave(invitationId: string) {
  const [error, setError] = useState<AutosaveErrorKind>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reassigned on every effect run (below) to close over that run's local
  // save-cycle state; `flush`/`saveSettings` (stable callbacks) always call
  // whatever these currently point at.
  const flushRef = useRef<() => Promise<AutosaveErrorKind>>(async () => null);
  const saveSettingsRef = useRef<(settings: SettingsPayload) => Promise<AutosaveErrorKind>>(async () => null);

  useEffect(() => {
    let inFlight = false;
    let pendingAgain = false;
    let revision = 0;
    // Set by `saveSettings` below; read (and cleared on success) by
    // `performSave`, exactly like `document`/`dirty` already are for the
    // document side — see point 4 above for why this shares the writer
    // instead of PATCHing independently.
    let pendingSettings: SettingsPayload | null = null;
    // Set once a save gets a 409 back and never cleared for the rest of
    // this hook instance (only a remount — i.e. reloading, per the "Tải
    // lại" button — starts a fresh one). Once true, `scheduleSave` becomes
    // a no-op and `performSave` short-circuits before ever calling
    // `fetch()` again: retrying a save this tab already knows is stale
    // would perform exactly the overwrite the version check exists to
    // prevent.
    let conflicted = false;
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
      if (conflicted) {
        // Nothing to do: this tab is permanently behind until reloaded, and
        // any write from here would be exactly the overwrite being guarded
        // against. Reported directly (not through `waiters`) since this
        // path is never reached while something else is in flight — a
        // conflict can only be set from within `performSave` itself, at a
        // point where `inFlight` has already gone back to `false`.
        setError("conflict");
        return "conflict";
      }

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
      const versionAtSend = useEditorStore.getState().version;
      // Snapshot whatever settings write is currently pending (if any) —
      // `pendingSettings` itself can be reassigned to a NEWER value by
      // `saveSettings` while this request is in flight (mirrors how
      // `document` can keep changing via `revision`), so this request must
      // send/compare against the value as of THIS send, not whatever
      // `pendingSettings` holds by the time the response comes back.
      const settingsAtSend = pendingSettings;
      const controller = new AbortController();
      activeAbortController = controller;
      useEditorStore.getState().setSaving(true);
      let result: AutosaveErrorKind = null;
      try {
        const res = await fetch(
          ...buildInvitationPatchRequest(
            invitationId,
            versionAtSend,
            { document, settings: settingsAtSend ?? undefined },
            { signal: controller.signal },
          ),
        );
        if (res.status === 409) {
          // This tab's `version` is behind — another tab (or this same one,
          // left open elsewhere) already saved. Stop for good: see
          // `conflicted`'s declaration above for why no retry is attempted.
          // `markSaved`/`setVersion` are deliberately NOT called — nothing
          // here was actually persisted.
          conflicted = true;
          setError("conflict");
          result = "conflict";
        } else if (!res.ok) {
          throw new Error(`Autosave failed with status ${res.status}`);
        } else {
          const body = (await res.json()) as { savedAt?: number; version?: number };
          // The server really did persist this write and bump the row's
          // version regardless of what's happened locally since — the next
          // save (whenever it fires) MUST send that new version, or it will
          // race against its own prior success and get a false 409. This is
          // why `setVersion` runs unconditionally, unlike `markSaved` below.
          if (typeof body.version === "number") {
            useEditorStore.getState().setVersion(body.version);
          }
          // If a newer edit landed while this request was in flight, this
          // response reflects an older document — it must not clear
          // `dirty`, or the newer edit would silently look "saved" when it
          // isn't yet.
          if (revision === revisionAtSend) {
            useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
          }
          // Clear the pending settings write, but only if nothing newer
          // overwrote it while this request was in flight — same
          // "don't clear something the response doesn't actually reflect"
          // reasoning as the `revision` check above, applied to settings.
          if (settingsAtSend !== null && pendingSettings === settingsAtSend) {
            pendingSettings = null;
          }
          setError(null);
        }
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
        if (pendingAgain && !conflicted) {
          pendingAgain = false;
          // The waiters queued above (including any `flush()` callers) are
          // resolved by THIS rerun's own settle, not by the call that's
          // returning right now.
          void performSave();
        } else {
          // A conflict cancels any queued rerun too — anyone waiting
          // (`flush()` callers queued while this request was in flight)
          // gets "conflict" as their outcome instead of triggering a save
          // this tab now knows would be rejected anyway.
          pendingAgain = false;
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
      // already succeeded, or there were never any edits or settings
      // changes. Report success without a wasted network round trip.
      if (!inFlight && !useEditorStore.getState().dirty && pendingSettings === null) {
        return null;
      }
      return performSave();
    };

    saveSettingsRef.current = (settings) => {
      // Setting this BEFORE calling `performSave` means it's visible
      // regardless of which path that call takes: sent immediately, folded
      // into an already-building request, or queued behind one already in
      // flight (`performSave` reads `pendingSettings` fresh in every case).
      pendingSettings = settings;
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
      saveSettingsRef.current = async () => null;

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
      // the-editor case, so a still-dirty document (or a settings write
      // still sitting in `pendingSettings` — e.g. the badge toggle fired
      // while a document save was in flight and got queued, then the
      // component unmounted before that queued rerun ever got to execute)
      // gets one last best-effort save attempt here instead of being
      // silently dropped. This also carries `version`, same as every other
      // PATCH — if the row was already saved elsewhere in the meantime, the
      // server rejects this with 409 too, and that's fine: the response is
      // never read (fire-and-forget), so there's nothing here that could
      // act on it and overwrite anything. Silently doing nothing IS the
      // correct outcome.
      const { dirty, document, version } = useEditorStore.getState();
      const validDocument = dirty && InvitationDocumentSchema.safeParse(document).success;
      if (validDocument || pendingSettings !== null) {
        fetch(
          ...buildInvitationPatchRequest(
            invitationId,
            version,
            { document: validDocument ? document : undefined, settings: pendingSettings ?? undefined },
            { keepalive: true },
          ),
        ).catch(() => {});
      }
    };
  }, [invitationId]);

  const flush = useCallback((): Promise<AutosaveErrorKind> => flushRef.current(), []);
  const saveSettings = useCallback(
    (settings: SettingsPayload): Promise<AutosaveErrorKind> => saveSettingsRef.current(settings),
    [],
  );

  return { error, flush, saveSettings };
}
