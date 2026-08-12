import { createContext, useContext } from "react";

/**
 * Render-time context threaded through every section component: who is
 * viewing (resolved server-side from `?g={token}`, Task 8's route), whether
 * the couple has opted into showing that guest's name at all
 * (`document.opening.showGuestName` — Phase 2 Task 2; previously only the
 * opening effects respected this flag, `CoverSection` ignored it outright),
 * whether this render is a live public page or an in-editor preview (Task 15
 * reuses `InvitePage` verbatim for the latter), and the invitation's public
 * `slug` (needed by `WishesSection` to call the public wishes API — `null`
 * in preview/editor, where there's no published slug to submit against
 * yet). Sections read this via `useInviteContext()` instead of taking
 * `guestName`/`showGuestName`/`isPreview`/`slug` as props, so adding a new
 * context field never touches the `SectionRenderer` registry's per-section
 * prop signatures.
 */
export interface InviteContextValue {
  guestName: string | null;
  showGuestName: boolean;
  isPreview: boolean;
  slug: string | null;
}

const defaultValue: InviteContextValue = {
  guestName: null,
  showGuestName: true,
  isPreview: false,
  slug: null,
};

export const InviteContext = createContext<InviteContextValue>(defaultValue);

export function useInviteContext(): InviteContextValue {
  return useContext(InviteContext);
}
