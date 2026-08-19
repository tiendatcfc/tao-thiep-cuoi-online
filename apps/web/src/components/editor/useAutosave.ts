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
 * NOT reach the server — see `unconfirmedSend` below for how the next save
 * tells a lost response apart from a real cross-session conflict. No
 * automatic retry loop runs on its own (see `performSave`'s comment) — the
 * header shows a manual "Thử lưu lại" action (`flush`, below) instead of
 * claiming one will happen by itself.
 * `"invalid"` — the document fails `InvitationDocumentSchema` client-side.
 * Whole-document validation means one bad field anywhere blocks the entire
 * save on every retry forever, so this gets its own distinct message
 * instead of being lumped in with "network failed".
 * `"conflict"` — the server rejected the PATCH with 409, and this hook could
 * not VERIFY the gap as its own previously-unconfirmed write landing (see
 * `unconfirmedSend`): another tab, or this same tab left open elsewhere,
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
 * Structural equality, order-independent for object keys (Postgres `jsonb`
 * does not guarantee it round-trips key order) but order-DEPENDENT for
 * arrays (a `sections` array's order is meaningful). Used only to compare
 * "the document we sent" against "what the server says it actually has" —
 * see `performSave`'s 409-reconciliation branch (point 3 below) for why a
 * raw `JSON.stringify` comparison would be too fragile for that.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(bRecord, key) && deepEqual(aRecord[key], bRecord[key]));
}

/**
 * Fetches this invitation's CURRENT server-side state for the sole purpose
 * of verifying a reconciliation (point 3 below) — never used for anything
 * else, and deliberately swallows every failure into `null` ("couldn't
 * verify") rather than throwing, since the caller's only correct response
 * to "couldn't verify" is to fail closed (latch a conflict) either way.
 */
async function fetchServerInvitationState(
  invitationId: string,
): Promise<{ document: unknown; version: number } | null> {
  try {
    const res = await fetch(`/api/invitations/${invitationId}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { invitation?: { document?: unknown; version?: unknown } };
    if (!body.invitation || typeof body.invitation.version !== "number") return null;
    return { document: body.invitation.document, version: body.invitation.version };
  } catch {
    return null;
  }
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
 * 1. **Flush on unmount, without ever aborting an in-flight save, and
 *    without letting a save that settles AFTER unmount touch whatever
 *    invitation's state now lives in the shared, module-level store.** A
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
 *    a moment after this tab gave up on ever learning that. Instead, the
 *    final write is CHAINED onto the in-flight one via the same `waiters`
 *    queue `flush()` uses: once it settles, the keepalive fires. On SPA
 *    navigation the JS context survives to actually run this; a genuine
 *    page unload is already covered by the `beforeunload` prompt below.
 *
 *    `dirty`, `document`, and `pendingSettings` for that final keepalive are
 *    snapshotted SYNCHRONOUSLY at the moment this cleanup runs — not read
 *    again later when the in-flight save actually settles. The store is a
 *    SINGLE module-level instance shared by every editor route, reseeded by
 *    the next invitation's own `EditorLayout` mount in between (its own
 *    `setDocument` call) — reading `document`/`dirty` again at settle time
 *    would silently read that OTHER invitation's state and could PATCH THIS
 *    invitation's id with THAT invitation's content. `version` is instead
 *    taken from `confirmedVersion` (below), a value this hook instance
 *    tracks entirely on its own — never read back out of the shared store —
 *    so a later mount changing the store's `version` can't affect it either.
 *    For the same reason, every store WRITE `performSave` makes
 *    (`setVersion`, `markSaved`, `setSaving`) is skipped once `unmounted`
 *    (below) is `true`, and a save that was merely QUEUED (`pendingAgain`)
 *    before unmount no longer starts a fresh send afterward — it would
 *    otherwise read the (possibly already-reseeded) store's CURRENT
 *    `document` and send it under THIS invitation's id.
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
 * 3. **A lost response is not a conflict — but it must be VERIFIED, not
 *    inferred.** `Invitation.version` is incremented by exactly one place in
 *    the whole app — this route's PATCH handler — so "the row's version
 *    moved" does not by itself imply ANOTHER session wrote: it can just as
 *    easily be this same tab's own prior write, which committed on the
 *    server but whose result this tab never learned (a dropped connection,
 *    a 502/504, a truncated body). `unconfirmedSend` (below, inside the
 *    effect) remembers the `{ version, document }` that was in flight the
 *    last time that happened.
 *
 *    A later 409 whose `currentVersion` is EXACTLY `unconfirmedSend.version
 *    + 1` is consistent with "this tab's own write landed" — but version
 *    arithmetic ALONE cannot tell that apart from "this tab's write never
 *    arrived at all, and exactly one foreign write landed instead": both
 *    produce the identical `currentVersion`. Trusting the arithmetic alone
 *    would silently overwrite that foreign write. So this doesn't infer —
 *    it verifies: it re-fetches the invitation (`GET`) and reconciles ONLY
 *    if the server's `document` deep-equals `unconfirmedSend.document` —
 *    the payload that was ACTUALLY SENT during the unconfirmed attempt, not
 *    whatever the live document looks like now. A match means the server
 *    has exactly what this tab tried to write and nothing else landed in
 *    between — safe to adopt the confirmed version and re-send once with
 *    the document this save cycle is already sending (a strict continuation
 *    of the write that just landed) instead of latching. A mismatch (or a
 *    failed/inconclusive verification GET) means this tab's write did NOT
 *    land and something else's did — latching is the only safe outcome,
 *    since resending would silently overwrite that other write. A gap that
 *    isn't exactly `+1`, or a second 409 on the re-send itself, is likewise
 *    genuinely unexplained and latches for good, exactly as before.
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
    // Set once a save gets a 409 back that this hook could NOT verify as its
    // own write landing, and never cleared for the rest of this hook
    // instance (only a remount — i.e. reloading, per the "Tải lại" button —
    // starts a fresh one). Once true, `scheduleSave` becomes a no-op and
    // `performSave` short-circuits before ever calling `fetch()` again:
    // retrying a save this tab already knows is stale would perform exactly
    // the overwrite the version check exists to prevent.
    let conflicted = false;
    // This hook instance's own record of "what did I send that I never got
    // confirmation for" — `{ version, document }` as of that specific send,
    // or `null` when nothing is currently unconfirmed. Cleared on every
    // successful save. Read by the very next 409 to decide whether a
    // VERIFIED reconciliation (point 3 above) is even worth attempting —
    // never trusted on its own.
    let unconfirmedSend: { version: number; document: InvitationDocument } | null = null;
    // This hook instance's own last-confirmed `version` — updated ONLY by
    // this hook's own successful writes (a plain 200, or a verified
    // reconciliation), and read back ONLY by this hook's own final-write
    // chain at unmount (see point 1 above). Deliberately never read FROM
    // the shared store (unlike the store's own `version` field, which a
    // later invitation's editor mount can freely reseed) so that a stale
    // continuation of THIS invitation's save can't be confused by whatever
    // a DIFFERENT invitation's editor has since done to the shared store.
    let confirmedVersion = useEditorStore.getState().version;
    // Set at the very top of this effect's cleanup (unmount), before
    // anything else. Once `true`, `performSave` skips every WRITE it would
    // otherwise make to the shared store (`setVersion`/`markSaved`/
    // `setSaving`) — see point 1 above for why: the store may by then belong
    // to a completely different invitation's editor. Does not stop an
    // ALREADY in-flight request's own promise from resolving (it can't be
    // un-sent), and does not stop a QUEUED (`pendingAgain`) rerun from being
    // cancelled — see the `finally` block below — since starting a FRESH
    // send after unmount would read the (possibly already-reseeded) store's
    // CURRENT document under THIS invitation's id.
    let unmounted = false;
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
        // it gets back is VERIFIED (point 3 above) as THIS tab's own
        // previously unconfirmed write landing on the server — exactly one
        // automatic re-send with the now-confirmed version. `document` (and
        // `settingsAtSend`) are captured ONCE, above, before this loop —
        // the re-send carries the same payload this save cycle already
        // committed to sending, not whatever the live document has become
        // since (a newer edit arriving mid-cycle is handled by the ordinary
        // `pendingAgain` queueing in the `finally` block below, same as
        // always).
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
              // A 409 is positive proof THIS specific send did not commit —
              // unlike the generic `catch` below, nothing here is
              // "unknown". A body that fails to parse just means
              // `currentVersion` can't be read; it must not be treated as
              // an unconfirmed send (that would claim the opposite of what
              // just happened) and must not overwrite the real
              // `unconfirmedSend` this attempt might need to preserve for a
              // LATER save to reconcile against.
              let currentVersion: number | null = null;
              try {
                const body = (await res.json()) as { currentVersion?: number };
                currentVersion = typeof body.currentVersion === "number" ? body.currentVersion : null;
              } catch {
                currentVersion = null;
              }

              if (!autoResendUsed && unconfirmedSend !== null && currentVersion === unconfirmedSend.version + 1) {
                // The row moved by EXACTLY one version past our last
                // unconfirmed send. Version arithmetic alone can't tell
                // "our write landed, we didn't hear back" apart from "our
                // write never arrived, and exactly one FOREIGN write landed
                // instead" — both look identical here. Verify instead of
                // inferring: fetch what the server actually has right now.
                const serverState = await fetchServerInvitationState(invitationId);
                if (
                  serverState !== null &&
                  serverState.version === currentVersion &&
                  deepEqual(serverState.document, unconfirmedSend.document)
                ) {
                  // The server's document is EXACTLY what we sent and
                  // nothing else landed — this really was our own write.
                  // Confirm it and loop once more instead of latching.
                  autoResendUsed = true;
                  unconfirmedSend = null;
                  confirmedVersion = currentVersion;
                  if (!unmounted) {
                    useEditorStore.getState().setVersion(currentVersion);
                  }
                  continue;
                }
                // Either the verification GET itself failed/was
                // inconclusive (fail closed — nothing here can prove it's
                // safe to overwrite), or the server's document does NOT
                // match what we sent: our write never landed and a genuine
                // foreign write did. Resending now would silently destroy
                // that foreign write, so this falls through to the latch
                // below exactly like any other unexplained conflict.
              }
              // Either nothing was unconfirmed to explain the gap, the gap
              // isn't exactly one write, verification failed, or the
              // re-send above ALSO conflicted — genuinely explained only by
              // another session. Stop for good: see `conflicted`'s
              // declaration above for why no further retry is attempted.
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
            // 409. `confirmedVersion` (this hook's own bookkeeping) is
            // updated unconditionally; the SHARED STORE write is skipped
            // once `unmounted` — see point 1 above.
            unconfirmedSend = null;
            if (typeof body.version === "number") {
              confirmedVersion = body.version;
              if (!unmounted) {
                useEditorStore.getState().setVersion(body.version);
              }
            }
            // If a newer edit landed while this request was in flight, this
            // response reflects an older document — it must not clear
            // `dirty`, or the newer edit would silently look "saved" when
            // it isn't yet. Skipped entirely once `unmounted` — see point 1
            // above.
            if (!unmounted && revision === revisionAtSend) {
              useEditorStore.getState().markSaved(body.savedAt ?? Date.now());
            }
            // Clear the pending settings write, but only if nothing newer
            // overwrote it while this request was in flight — same
            // "don't clear something the response doesn't actually
            // reflect" reasoning as the `revision` check above, applied to
            // settings. `pendingSettings` is this hook's own closure
            // variable, not the shared store, so this is safe regardless of
            // `unmounted`.
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
            // reached (or committed on) the server. `unconfirmedSend`
            // (above) is exactly for letting a LATER save verify the two
            // apart. Leave `dirty: true` — the next mutation, OR an
            // explicit `flush()` (the "Thử lưu lại" button), re-arms this.
            // No automatic retry loop is started here.
            unconfirmedSend = { version: versionAtSend, document };
            setError("network");
            result = "network";
            break;
          }
        }
      } finally {
        if (!unmounted) {
          useEditorStore.getState().setSaving(false);
        }
        inFlight = false;
        if (pendingAgain && !conflicted && !unmounted) {
          pendingAgain = false;
          // The waiters queued above (including any `flush()` callers, and
          // the unmount cleanup's chained keepalive) are resolved by THIS
          // rerun's own settle, not by the call that's returning right now.
          void performSave();
        } else {
          // A conflict cancels any queued rerun too — anyone waiting
          // (`flush()` callers queued while this request was in flight)
          // gets "conflict" as their outcome instead of triggering a save
          // this tab now knows would be rejected anyway. Once `unmounted`,
          // a queued rerun is cancelled the same way — see point 1 above
          // for why starting a FRESH send after unmount is unsafe (it would
          // read whatever a later invitation's editor has since done to the
          // shared store).
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
      // Must be set before anything else below reads or decides based on
      // it — see its own declaration above.
      unmounted = true;
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
      // silently dropped.
      //
      // `dirty`/`document`/`pendingSettings` are captured SYNCHRONOUSLY
      // right here, at cleanup time — not inside `sendFinalKeepalive` at
      // the point it actually runs, which (when a save is still in flight)
      // can be AFTER a completely different invitation's `EditorLayout` has
      // already mounted and reseeded this same, module-level store. See
      // point 1 in this hook's own docstring above.
      const { dirty: dirtyAtCleanup, document: documentAtCleanup } = useEditorStore.getState();
      const pendingSettingsAtCleanup = pendingSettings;
      const validDocumentAtCleanup =
        dirtyAtCleanup && InvitationDocumentSchema.safeParse(documentAtCleanup).success;

      function sendFinalKeepalive(version: number) {
        if (validDocumentAtCleanup || pendingSettingsAtCleanup !== null) {
          fetch(
            ...buildInvitationPatchRequest(
              invitationId,
              version,
              {
                document: validDocumentAtCleanup ? documentAtCleanup : undefined,
                settings: pendingSettingsAtCleanup ?? undefined,
              },
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
        // `keepalive`, final write) — then send the final keepalive using
        // `confirmedVersion` AS IT STANDS AT THAT LATER MOMENT (read inside
        // the closure below, not captured now): either the server's real
        // post-commit version, or this hook's own verified reconciliation
        // of a false 409, either way tracked entirely by this hook
        // instance and never read back out of the shared store.
        waiters.push(() => sendFinalKeepalive(confirmedVersion));
      } else {
        sendFinalKeepalive(confirmedVersion);
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
