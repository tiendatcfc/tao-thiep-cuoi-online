import { InvitationDocumentSchema, type InvitationDocument } from "@hpwd/schema";
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

/**
 * Validates a template's stored `document` and returns a fully independent
 * deep copy of it — never the same object, nor sharing any nested
 * object/array, with whatever was passed in. `POST /api/invitations` uses
 * this to build a brand-new `Invitation.document`: the editor's autosave
 * later mutates that document in place, and it must never be able to reach
 * back and corrupt the shared `Template` row every other couple creates
 * invitations from.
 *
 * This property can only be proven in-process (an object round-tripped
 * through two independent Postgres reads is always reference-distinct
 * regardless of whether this function even ran) — see
 * `invitations.test.ts`'s `buildInvitationDocumentFromTemplate` suite,
 * which asserts identity/isolation directly on this function's return
 * value rather than through the database.
 *
 * Returns `null` (never throws) when schema validation fails, matching
 * `deriveCoverNames`'s convention — the caller decides how to surface that
 * (`POST /api/invitations` returns 500 with a Vietnamese message for a
 * corrupt seeded template).
 */
export function buildInvitationDocumentFromTemplate(rawTemplateDocument: unknown): InvitationDocument | null {
  const parsed = InvitationDocumentSchema.safeParse(rawTemplateDocument);
  if (!parsed.success) return null;
  return structuredClone(parsed.data);
}

/** The subset of an `Invitation` row `toInvitationSummary` needs — deliberately narrower than Prisma's full `Invitation` type so a `select`-narrowed query result satisfies it too. */
export interface InvitationListRow {
  id: string;
  slug: string;
  status: "draft" | "published";
  publishedAt: Date | null;
  viewCount: number;
  updatedAt: Date;
  document: unknown;
}

export interface InvitationSummary {
  id: string;
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  viewCount: number;
  updatedAt: string;
  coverNames: string;
}

/**
 * Shapes one `Invitation` row into the list-view summary both
 * `GET /api/invitations` and the dashboard render — factored out so that
 * mapping lives in exactly one place instead of two copies drifting apart.
 * Dates are stringified to ISO here (not left as `Date` objects) since the
 * dashboard passes this straight through a Server->Client component
 * boundary as props, which needs plain strings; the API route's
 * `NextResponse.json` would have stringified them anyway.
 */
export function toInvitationSummary(row: InvitationListRow): InvitationSummary {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    viewCount: row.viewCount,
    updatedAt: row.updatedAt.toISOString(),
    coverNames: deriveCoverNames(row.document),
  };
}
