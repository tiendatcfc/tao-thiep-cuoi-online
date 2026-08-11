/**
 * `Invitation.settings` is an untyped `Json` column (default
 * `{"showBadge": true}`). This narrows it defensively rather than trusting
 * the DB shape, since a future settings field or a hand-edited row shouldn't
 * be able to crash either the public page (`app/i/[slug]/page.tsx`) or the
 * editor (`app/(dashboard)/editor/[id]/page.tsx`) — both read it, so the
 * parsing lives here once instead of being duplicated at each call site.
 */
export interface InvitationSettings {
  showBadge: boolean;
}

export const DEFAULT_INVITATION_SETTINGS: InvitationSettings = { showBadge: true };

export function parseInvitationSettings(raw: unknown): InvitationSettings {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "showBadge" in raw &&
    typeof (raw as { showBadge: unknown }).showBadge === "boolean"
  ) {
    return { showBadge: (raw as { showBadge: boolean }).showBadge };
  }
  return DEFAULT_INVITATION_SETTINGS;
}
