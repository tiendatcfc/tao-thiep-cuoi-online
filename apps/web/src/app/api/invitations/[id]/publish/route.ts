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
  // Every slug ever actually published (including the current one, upserted
  // below) lives in `InvitationSlug`, so this is the check that stops a
  // stranger from grabbing a couple's abandoned link. Reclaiming your OWN
  // history (`invitationId === id`) is always allowed.
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
    await prisma.$transaction([
      prisma.invitation.update({
        where: { id },
        data: {
          slug,
          publishedDocument: parsedDocument.data,
          status: "published",
          publishedAt,
        },
      }),
      // Records `slug` as one this invitation has published under — a
      // no-op `update: {}` when it's already there (e.g. republishing under
      // the same or a reclaimed slug), otherwise the row that makes this
      // slug protected against squatting and redirectable from now on. Runs
      // in the SAME transaction as the update above: a slug change that
      // updated `Invitation.slug` without recording history here would
      // silently reopen the squatting hole this task closes.
      prisma.invitationSlug.upsert({
        where: { slug },
        create: { slug, invitationId: id },
        update: {},
      }),
    ]);
  } catch (error) {
    // Both uniqueness checks above (`slugOwner`, `slugHistoryOwner`) have a
    // TOCTOU gap: two requests racing to claim the same brand-new slug can
    // both pass them before either writes. The DB-level unique constraints
    // on `Invitation.slug` and `InvitationSlug.slug` are the real guard —
    // this just translates the resulting P2002 (from either table) into the
    // same 409 a non-racing conflict gets, instead of an unhandled 500.
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
