"use client";

import { createContext, useContext } from "react";
import type { AutosaveErrorKind } from "./useAutosave";

export interface AutosaveStatus {
  error: AutosaveErrorKind;
  /** See `useAutosave`'s own docstring ("Explicit flush") for the full contract. */
  flush: () => Promise<AutosaveErrorKind>;
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
const DEFAULT_STATUS: AutosaveStatus = { error: null, flush: async () => null };

export const AutosaveStatusContext = createContext<AutosaveStatus>(DEFAULT_STATUS);

export function useAutosaveStatusContext(): AutosaveStatus {
  return useContext(AutosaveStatusContext);
}
