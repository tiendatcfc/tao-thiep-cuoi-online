import { prisma } from "@hpwd/db";

/**
 * Shared 404 copy for "this invitation doesn't exist or isn't yours" —
 * every route using `findOwnedInvitation` below should return this exact
 * message so the two cases stay indistinguishable to the caller.
 */
export const NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";

/**
 * Owner-only fetch of an invitation by id. Returns `null` (never throws,
 * never distinguishes) whenever the invitation doesn't exist OR belongs to
 * a different user — the two cases are deliberately indistinguishable to
 * the caller, so a guessed id can't be used to probe which ids exist.
 *
 * Shared by every route that needs "fetch a thing I own or 404"
 * (`api/invitations/[id]/route.ts`, `api/invitations/[id]/publish/route.ts`)
 * so this invariant lives in exactly one place instead of drifting across
 * independently-maintained copies.
 */
export async function findOwnedInvitation(id: string, ownerId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== ownerId) {
    return null;
  }
  return invitation;
}
