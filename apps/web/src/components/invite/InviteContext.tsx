import { createContext, useContext } from "react";

/**
 * Render-time context threaded through every section component: who is
 * viewing (resolved server-side from `?g={token}`, Task 8's route) and
 * whether this render is a live public page or an in-editor preview (Task
 * 15 reuses `InvitePage` verbatim for the latter). Sections read this via
 * `useInviteContext()` instead of taking `guestName`/`isPreview` as props,
 * so adding a new context field never touches the `SectionRenderer`
 * registry's per-section prop signatures.
 */
export interface InviteContextValue {
  guestName: string | null;
  isPreview: boolean;
}

const defaultValue: InviteContextValue = {
  guestName: null,
  isPreview: false,
};

export const InviteContext = createContext<InviteContextValue>(defaultValue);

export function useInviteContext(): InviteContextValue {
  return useContext(InviteContext);
}
