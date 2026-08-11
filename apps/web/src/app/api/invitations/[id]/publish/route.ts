import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { auth } from "@/auth";

const NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";
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
 * Owner-only fetch, identical rationale to `[id]/route.ts`'s helper: 404
 * (never 403) whenever the invitation doesn't exist OR belongs to a
 * different user, so a guessed id can't be used to probe which ids exist.
 */
async function findOwnedInvitation(id: string, ownerId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== ownerId) {
    return null;
  }
  return invitation;
}

/**
 * Publishes the current draft: validates the requested slug (format +
 * uniqueness against every OTHER invitation — re-publishing under the
 * invitation's own existing slug is always allowed), validates the draft
 * `document` against the full schema one more time (autosave already
 * enforces this on write, but a belt-and-suspenders check here means a
 * corrupt row can never become publicly visible), then atomically snapshots
 * `document` into `publishedDocument` and flips `status`/`publishedAt`.
 *
 * `revalidatePath` busts the Next.js full-route cache for the public page so
 * a couple re-publishing under the same slug (edit -> publish again) sees
 * their changes immediately instead of a stale cached render.
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
    return NextResponse.json({ error: SLUG_INVALID_MESSAGE }, { status: 400 });
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

  const parsedDocument = InvitationDocumentSchema.safeParse(invitation.document);
  if (!parsedDocument.success) {
    return NextResponse.json({ error: INVALID_DOCUMENT_MESSAGE }, { status: 400 });
  }

  const publishedAt = new Date();
  try {
    await prisma.invitation.update({
      where: { id },
      data: {
        slug,
        publishedDocument: parsedDocument.data,
        status: "published",
        publishedAt,
      },
    });
  } catch (error) {
    // The `slugOwner` check above has a TOCTOU gap: two requests racing to
    // claim the same brand-new slug can both pass it before either writes.
    // The `slug` column's DB-level unique constraint is the real guard —
    // this just translates the resulting P2002 into the same 409 a
    // non-racing conflict gets, instead of an unhandled 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
    }
    throw error;
  }

  revalidatePath(`/i/${slug}`);

  return NextResponse.json({ slug, publishedAt });
}
