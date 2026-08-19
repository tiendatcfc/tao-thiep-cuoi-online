import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { auth } from "@/auth";
import { findOwnedInvitation, NOT_FOUND_MESSAGE } from "@/lib/ownership";

const MALFORMED_BODY_MESSAGE = "Yêu cầu không hợp lệ, vui lòng thử lại.";
const SLUG_INVALID_MESSAGE =
  "Đường dẫn chỉ được chứa chữ thường không dấu, số và dấu gạch ngang, độ dài 3-60 ký tự.";
const SLUG_TAKEN_MESSAGE = "Đường dẫn này đã được sử dụng cho thiệp khác, vui lòng chọn đường dẫn khác.";
const INVALID_DOCUMENT_MESSAGE =
  "Nội dung thiệp hiện tại chưa hợp lệ, vui lòng kiểm tra lại trước khi xuất bản.";

// Same shape autosave enforces client-side (toSlug's own output never
// produces anything outside this), kept independent here since the request
// body is untrusted input regardless of what the editor's UI sends.
const SLUG_REGEX = /^[a-z0-9-]{3,60}$/;

const publishBodySchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
});

/**
 * Thrown from inside the publish transaction when `InvitationSlug`'s
 * in-transaction ownership re-check (see the transaction body below) finds
 * the slug already belongs to a DIFFERENT invitation. Caught right next to
 * the transaction and translated into the same 409 as every other
 * slug-taken path — never propagates further, never leaks whose slug it is.
 */
class SlugTakenError extends Error {}

/**
 * Publishes the current draft: validates the requested slug (format +
 * uniqueness against every OTHER invitation's current slug AND its slug
 * history — re-publishing under the invitation's own current or past slug
 * is always allowed), validates the draft `document` against the full
 * schema one more time (autosave already enforces this on write, but a
 * belt-and-suspenders check here means a corrupt row can never become
 * publicly visible), then atomically snapshots `document` into
 * `publishedDocument`, flips `status`/`publishedAt`, and records `slug` in
 * `InvitationSlug` so it stays permanently attributed to this invitation.
 *
 * `revalidatePath` busts the Next.js full-route cache for the public page.
 * When this publish changes the slug, BOTH the old and new path are busted:
 * the new one so a couple re-publishing sees their changes immediately
 * instead of a stale cached render, the old one so its cached page picks up
 * the permanent redirect to the new slug (`/i/[slug]/page.tsx`) instead of
 * continuing to serve whatever was cached before this publish.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: MALFORMED_BODY_MESSAGE }, { status: 400 });
  }

  const parsedBody = publishBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: SLUG_INVALID_MESSAGE }, { status: 400 });
  }
  const { slug } = parsedBody.data;

  const slugOwner = await prisma.invitation.findUnique({ where: { slug } });
  if (slugOwner && slugOwner.id !== id) {
    return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
  }

  // Squatting guard: `slug` may not currently belong to any invitation (the
  // check above) yet still be reserved — it could be a slug a DIFFERENT
  // invitation published under previously and has since moved away from.
  // Every slug ever actually published (including the current one,
  // recorded below) lives in `InvitationSlug`, so this is the check that
  // stops a stranger from grabbing a couple's abandoned link. Reclaiming
  // your OWN history (`invitationId === id`) is always allowed. This is a
  // fast-path check only — it runs BEFORE the transaction below, which
  // re-validates ownership against the true, currently-committed state
  // right before writing (see the comment there for why the pre-check
  // alone isn't sufficient).
  const slugHistoryOwner = await prisma.invitationSlug.findUnique({ where: { slug } });
  if (slugHistoryOwner && slugHistoryOwner.invitationId !== id) {
    return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
  }

  const parsedDocument = InvitationDocumentSchema.safeParse(invitation.document);
  if (!parsedDocument.success) {
    return NextResponse.json({ error: INVALID_DOCUMENT_MESSAGE }, { status: 400 });
  }

  const previousSlug = invitation.slug;
  const publishedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id },
        data: {
          slug,
          publishedDocument: parsedDocument.data,
          status: "published",
          publishedAt,
        },
      });

      // Re-check ownership of the slug-history row INSIDE the transaction
      // rather than trusting `slugHistoryOwner` above: that check ran
      // BEFORE this transaction started, so a completely different
      // invitation can claim this exact slug and then move away from it
      // again, entirely in the window between the two — leaving a stale
      // `InvitationSlug` row this route never saw. A blind
      // `upsert({ update: {} })` keyed only on `slug` would silently no-op
      // on that row without ever comparing `invitationId` (Postgres's
      // `ON CONFLICT (slug) DO UPDATE` only keys on `slug`), so
      // `Invitation.slug` would end up pointing here while
      // `InvitationSlug.invitationId` still points at the other
      // invitation — the exact "a distributed link resolves to a
      // stranger's wedding" bug this task exists to prevent. Reading the
      // row back here, inside the same transaction as the `Invitation`
      // update above, closes that gap: either branch below runs against
      // the true, currently-committed owner.
      const existing = await tx.invitationSlug.findUnique({
        where: { slug },
        select: { invitationId: true },
      });
      if (!existing) {
        // A concurrent first-time claim of this exact slug can still race
        // here — `InvitationSlug.slug`'s own unique constraint throws
        // P2002, caught below and translated into the same 409.
        await tx.invitationSlug.create({ data: { slug, invitationId: id } });
      } else if (existing.invitationId !== id) {
        throw new SlugTakenError();
      }
      // else: already ours (first publish under this slug, or reclaiming a
      // slug from our own history) — nothing to write.
    });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
    }
    // The two pre-checks above (`slugOwner`, `slugHistoryOwner`) — and the
    // in-transaction re-check above — still leave a TOCTOU gap for a
    // brand-new slug nobody has ever claimed: two requests can both find
    // nothing and both attempt to create. The DB-level unique constraints
    // on `Invitation.slug` and `InvitationSlug.slug` are the real guard for
    // THAT race — this translates the resulting P2002 (from either table)
    // into the same 409 a non-racing conflict gets, instead of an
    // unhandled 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
    }
    throw error;
  }

  // If this publish changed the slug, the OLD slug's cached page must be
  // busted too: `/i/[slug]/page.tsx` now permanently redirects a historical
  // slug to the invitation's current one instead of 404ing, so a stale
  // cached render of the old page (from before this publish) would keep
  // serving the previous content instead of picking up the new redirect.
  if (previousSlug !== slug) {
    revalidatePath(`/i/${previousSlug}`);
  }
  revalidatePath(`/i/${slug}`);

  return NextResponse.json({ slug, publishedAt });
}
