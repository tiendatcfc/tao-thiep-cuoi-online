import { InvitationDocumentSchema } from "@hpwd/schema";
import { findCoverSection } from "./sections";

/** Shared fallback for a document with no (or blank) cover names — used by `GET /api/invitations` and the dashboard's card list, so the two never drift apart. */
export const NO_COVER_NAME_FALLBACK = "Thiệp chưa đặt tên";

/**
 * Derives a "Groom & Bride" display name from an invitation's `document`
 * for list views (dashboard cards, `GET /api/invitations`) that don't need
 * the full document. Never throws: a malformed/legacy document, a missing
 * cover section, or blank/whitespace-only names all fall back to
 * `NO_COVER_NAME_FALLBACK` rather than surfacing "undefined & undefined" or
 * crashing the list.
 */
export function deriveCoverNames(rawDocument: unknown): string {
  const parsed = InvitationDocumentSchema.safeParse(rawDocument);
  if (!parsed.success) return NO_COVER_NAME_FALLBACK;

  const cover = findCoverSection(parsed.data.sections);
  const groomName = cover?.props.groomName.trim() ?? "";
  const brideName = cover?.props.brideName.trim() ?? "";
  if (!groomName && !brideName) return NO_COVER_NAME_FALLBACK;
  if (groomName && brideName) return `${groomName} & ${brideName}`;
  return groomName || brideName;
}
