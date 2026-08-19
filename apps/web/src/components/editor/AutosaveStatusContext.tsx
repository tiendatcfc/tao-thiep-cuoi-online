"use client";

import { createContext, useContext } from "react";
import type { AutosaveErrorKind, SettingsPayload } from "./useAutosave";

export interface AutosaveStatus {
  error: AutosaveErrorKind;
  /** See `useAutosave`'s own docstring ("Explicit flush") for the full contract. */
  flush: () => Promise<AutosaveErrorKind>;
  /**
   * See `useAutosave`'s own docstring (point 4, "Settings share the same
   * writer") for the full contract. `PublishDialog`'s badge toggle must call
   * THIS instead of PATCHing `/api/invitations/[id]` itself — a second,
   * independent writer racing this hook's own document autosave for the
   * same row `version` is exactly the false-conflict bug that contract
   * exists to prevent.
   */
  saveSettings: (settings: SettingsPayload) => Promise<AutosaveErrorKind>;
}

/**
 * `useAutosave`'s result isn't in the editor store (see the hook's own
 * comment for why), but more than one component below `EditorLayout` needs
 * it — the desktop header AND the mobile tab bar both show save status
 * (`SaveStatus`), and `PublishDialog` needs `flush` before it publishes
 * (C2) — and mounting `useAutosave` more than once would schedule
 * competing PATCHes. This tiny context lets `EditorLayout` own the single
 * hook instance and hand the result down to all three. Lives in its own
 * module (not inside `EditorLayout.tsx`, which is where it used to live)
 * specifically so `PublishDialog.tsx` can import it without a circular
 * import — `EditorLayout` renders `PublishDialog`, so the reverse import
 * would be circular if the context stayed there.
 */
const DEFAULT_STATUS: AutosaveStatus = { error: null, flush: async () => null, saveSettings: async () => null };

export const AutosaveStatusContext = createContext<AutosaveStatus>(DEFAULT_STATUS);

export function useAutosaveStatusContext(): AutosaveStatus {
  return useContext(AutosaveStatusContext);
}
