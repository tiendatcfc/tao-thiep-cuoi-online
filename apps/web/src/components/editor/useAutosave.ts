"use client";

import { InvitationDocumentSchema, type InvitationDocument } from "@hpwd/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * `null` — nothing to report (idle, or the last attempt succeeded).
 * `"network"` — the PATCH's outcome is UNKNOWN: the request itself failed
 * (offline, a dropped connection), the response was a non-OK/non-409 status
 * (e.g. a 502/504 from a proxy), or the response body couldn't even be
 * parsed (a truncated body). Critically, none of these mean the write did
 * NOT reach the server — see `unconfirmedVersion` below for how the next
 * save tells a lost response apart from a real cross-session conflict. No
 * automatic retry loop runs on its own (see `performSave`'s comment) — the
 * header shows a manual "Thử lưu lại" action (`flush`, below) instead of
 * claiming one will happen by itself.
 * `"invalid"` — the document fails `InvitationDocumentSchema` client-side.
 * Whole-document validation means one bad field anywhere blocks the entire
 * save on every retry forever, so this gets its own distinct message
 * instead of being lumped in with "network failed".
 * `"conflict"` — the server rejected the PATCH with 409, and this hook could
 * not explain the gap as its own previously-unconfirmed write landing (see
 * `unconfirmedVersion`): another tab, or this same tab left open elsewhere,
 * really did save in between. Unlike `"network"`, this is terminal for the
 * rest of this hook instance — see `performSave`'s `conflicted` flag below
 * for why retrying is never attempted.
 */
export type AutosaveErrorKind = "network" | "invalid" | "conflict" | null;

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
 * Four durability/correctness properties beyond the basic debounce:
 *
 * 1. **Flush on unmount, without ever aborting an in-flight save.** A
 *    Next.js client-side route change or the Back button unmounts this hook
 *    WITHOUT firing `beforeunload` (that only fires on an actual page
 *    unload) — the ordinary way someone leaves `/editor/[id]`. Without an
 *    unmount flush, a debounce still pending at that moment silently drops
 *    the couple's last edits, so a final best-effort `keepalive` PATCH is
 *    sent here (fire-and-forget: nothing can react to its result after
 *    teardown anyway).
 *
 *    If a save is ALREADY in flight at unmount time, it is never aborted.
 *    An earlier version of this hook called `abort()` on it first, reasoning
 *    that otherwise the older request and the new flush could both be in
 *    flight and land out of order. That reasoning doesn't hold: aborting the
 *    CLIENT's `fetch` does not stop the SERVER's write from committing —
 *    `route.ts` never consults the request's abort signal — so the in-flight
 *    request could still commit and bump the row's `version` on the server
 *    a moment after this tab gave up on ever learning that. The flush that
 *    followed then sent the STALE pre-abort `version`, got an honest 409 for
 *    a write this very tab made, and (before this fix) that looked exactly
 *    like another session's conflict with nothing left to retry — losing
 *    the newest edits for good. Instead, the final write is CHAINED onto the
 *    in-flight one via the same `waiters` queue `flush()` uses: once it
 *    settles (successfully, or via this hook's own same-tab reconciliation
 *    below), the keepalive fires with whatever `version` that produced, and
 *    the CURRENT (latest) document — never the stale one from when the
 *    in-flight request was sent. On SPA navigation the JS context survives
 *    to actually run this; a genuine page unload is already covered by the
 *    `beforeunload` prompt below.
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
 * 3. **A lost response is not a conflict.** `Invitation.version` is
 *    incremented by exactly one place in the whole app — this route's PATCH
 *    handler — so "the row's version moved" does not by itself imply
 *    ANOTHER session wrote: it can just as easily be this same tab's own
 *    prior write, which committed on the server but whose result this tab
 *    never learned (a dropped connection, a 502/504, a truncated body).
 *    `unconfirmedVersion` (below, inside the effect) remembers the version
 *    that was in flight the last time that happened. The next 409 checks
 *    whether the server's `currentVersion` is EXACTLY `unconfirmedVersion +
 *    1` — i.e. explained by precisely one write landing, which can only be
 *    this tab's own unconfirmed one — and if so, treats it as confirmation
 *    rather than a conflict: it adopts the confirmed version and re-sends
 *    once with the current live document (a strict continuation of the
 *    write that just landed) instead of latching. A gap that isn't exactly
 *    `+1`, or a second 409 on the re-send itself, is genuinely unexplained
 *    by this tab's own history and latches for good, exactly as before.
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
    // The `version` that was in flight the last time a save's outcome came
    // back unknown ("network" — see the type's own doc comment above) —
    // `null` whenever nothing is currently unconfirmed. Cleared on every
    // successful save. Read (and, on a match, cleared) by the very next
    // 409 to distinguish this tab's own unconfirmed write landing from a
    // genuine conflict — see point 3 above.
    let unconfirmedVersion: number | null = null;
    // Resolved once a save cycle — including any `pendingAgain` rerun
    // chained after it — truly settles with nothing left queued. `flush()`
    // joins this instead of firing its own overlapping request when a save
    // is already in flight; the unmount cleanup below does too, to chain
    // its final keepalive write onto an in-flight save rather than
    // aborting it.
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
        // request. Run again, immediately, once the current one settles,
        // and resolve THIS call's promise once that (or a further chained
        // rerun) truly settles — see `resolveWaiters`.
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
      // Snapshot whatever settings write is currently pending (if any) —
      // `pendingSettings` itself can be reassigned to a NEWER value by
      // `saveSettings` while this request is in flight (mirrors how
      // `document` can keep changing via `revision`), so this request must
      // send/compare against the value as of THIS send, not whatever
      // `pendingSettings` holds by the time the response comes back.
      const settingsAtSend = pendingSettings;
      useEditorStore.getState().setSaving(true);
      let result: AutosaveErrorKind = null;
      // At most one automatic re-send per save cycle (point 3 above) — a
      // server that (incorrectly) kept reporting `currentVersion ===
      // lastSentVersion + 1` forever could otherwise spin. Local to this
      // `performSave` call: each fresh call gets its own chance.
      let autoResendUsed = false;

      try {
        // Loops at most twice: the normal attempt, and — only when the 409
        // it gets back is fully explained by THIS tab's own previously
        // unconfirmed write landing on the server — exactly one automatic
        // re-send with the now-confirmed version.
        for (;;) {
          const versionAtSend = useEditorStore.getState().version;
          try {
            const res = await fetch(
              ...buildInvitationPatchRequest(invitationId, versionAtSend, {
                document,
                settings: settingsAtSend ?? undefined,
              }),
            );

            if (res.status === 409) {
              const body = (await res.json()) as { currentVersion?: number };
              const currentVersion = typeof body.currentVersion === "number" ? body.currentVersion : null;
              if (!autoResendUsed && unconfirmedVersion !== null && currentVersion === unconfirmedVersion + 1) {
                // The row moved by EXACTLY one version past our last
                // unconfirmed send — the only writer of `version` in this
                // app is this very route, so that gap can only be this
                // tab's own earlier write finally landing (a dropped
                // response, a proxy timeout, ...), not another session.
                // Confirm it and loop once more with the current live
                // document — a strict continuation of the write that just
                // landed — instead of latching a false conflict.
                autoResendUsed = true;
                unconfirmedVersion = null;
                useEditorStore.getState().setVersion(currentVersion);
                continue;
              }
              // Either nothing was unconfirmed to explain the gap, the gap
              // isn't exactly one write, or the re-send above ALSO
              // conflicted — genuinely explained only by another session.
              // Stop for good: see `conflicted`'s declaration above for why
              // no further retry is attempted.
              conflicted = true;
              setError("conflict");
              result = "conflict";
              break;
            }

            if (!res.ok) {
              throw new Error(`Autosave failed with status ${res.status}`);
            }

            const body = (await res.json()) as { savedAt?: number; version?: number };
            // The server really did persist this write and bump the row's
            // version regardless of what's happened locally since — the
            // next save (whenever it fires) MUST send that new version, or
            // it will race against its own prior success and get a false
            // 409. This is why `setVersion` runs unconditionally, unlike
            // `markSaved` below.
            unconfirmedVersion = null;
            if (typeof body.version === "number") {
              useEditorStore.getState().setVersion(body.version);
            }
            // If a newer edit landed while this request was in flight, this
            // response reflects an older document — it must not clear
            // `dirty`, or the newer edit would silently look "saved" when
            // it isn't yet.
            if (revision === revisionAtSend) {
              useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
            }
            // Clear the pending settings write, but only if nothing newer
            // overwrote it while this request was in flight — same
            // "don't clear something the response doesn't actually
            // reflect" reasoning as the `revision` check above, applied to
            // settings.
            if (settingsAtSend !== null && pendingSettings === settingsAtSend) {
              pendingSettings = null;
            }
            setError(null);
            result = null;
            break;
          } catch {
            // Covers `fetch()` itself rejecting (offline, a dropped mobile
            // connection before any response arrives), a non-OK/non-409
            // status (a 502/504 from a proxy), AND `res.json()` throwing on
            // a truncated body — every one of these means the OUTCOME of
            // THIS specific send is unknown, not that it definitely never
            // reached (or committed on) the server. `unconfirmedVersion`
            // (above) is exactly for letting a LATER save tell the two
            // apart. Leave `dirty: true` — the next mutation, OR an
            // explicit `flush()` (the "Thử lưu lại" button), re-arms this.
            // No automatic retry loop is started here.
            unconfirmedVersion = versionAtSend;
            setError("network");
            result = "network";
            break;
          }
        }
      } finally {
        useEditorStore.getState().setSaving(false);
        inFlight = false;
        if (pendingAgain && !conflicted) {
          pendingAgain = false;
          // The waiters queued above (including any `flush()` callers, and
          // the unmount cleanup's chained keepalive) are resolved by THIS
          // rerun's own settle, not by the call that's returning right now.
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
      function sendFinalKeepalive() {
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
      }

      if (inFlight) {
        // A save is already in flight. It cannot be un-sent, and — as of
        // this fix — it is NOT aborted either: see this hook's own
        // docstring, point 1, for why aborting the client side used to
        // cause exactly the false-conflict/lost-edit bug this exists to
        // prevent. Instead, wait for it (and anything already queued
        // behind it) to fully settle — reusing the same `waiters` queue
        // `flush()` uses, WITHOUT setting `pendingAgain` (that would fire
        // an extra non-`keepalive` rerun; this cleanup wants exactly one,
        // `keepalive`, final write) — then send the final keepalive with
        // whatever `version` that settle produced: either the server's
        // real post-commit version, or this hook's own same-tab
        // reconciliation of a false 409, either way reflecting the true
        // current row state rather than the stale version that was in
        // flight at unmount time.
        waiters.push(() => sendFinalKeepalive());
      } else {
        sendFinalKeepalive();
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
