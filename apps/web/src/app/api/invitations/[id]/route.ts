import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { auth } from "@/auth";
import { findOwnedInvitation, NOT_FOUND_MESSAGE } from "@/lib/ownership";

const INVALID_DOCUMENT_MESSAGE = "Dữ liệu thiệp không hợp lệ, vui lòng thử lại.";

const settingsSchema = z.object({ showBadge: z.boolean() }).strict();

// `document` and `settings` are both optional so the autosave hook (which
// only ever sends `document`) and `PublishDialog`'s badge toggle (which
// only ever sends `settings`) can each PATCH just their own piece — but at
// least one of the two must be present, or this would silently be a no-op
// PATCH that still reports success. `version` is required (never defaulted)
// — a request that omits it is rejected with 400 rather than treated as
// version 0, since defaulting it would silently reintroduce the blind
// last-write-wins overwrite this whole check exists to prevent for any
// client that isn't sending it.
const patchBodySchema = z
  .object({
    document: InvitationDocumentSchema.optional(),
    settings: settingsSchema.optional(),
    version: z.number().int().min(0),
  })
  .refine((data) => data.document !== undefined || data.settings !== undefined, {
    message: INVALID_DOCUMENT_MESSAGE,
  });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      slug: invitation.slug,
      status: invitation.status,
      document: invitation.document,
      settings: invitation.settings,
      version: invitation.version,
    },
  });
}

/**
 * Autosave endpoint: replaces the draft `document` column only. Never
 * touches `publishedDocument` — that only changes when the invitation is
 * actually published (Task 17), so edits here never leak into the live
 * public page until the couple explicitly publishes.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: INVALID_DOCUMENT_MESSAGE }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_DOCUMENT_MESSAGE }, { status: 400 });
  }

  const data: { document?: typeof parsed.data.document; settings?: typeof parsed.data.settings } = {};
  if (parsed.data.document !== undefined) data.document = parsed.data.document;
  if (parsed.data.settings !== undefined) data.settings = parsed.data.settings;

  // Optimistic concurrency: only apply the write if the row's version still
  // matches what the client last read. `updateMany` (not `update`) is used
  // deliberately — it lets the `version` mismatch case fail as "0 rows
  // matched" instead of a thrown not-found error, so it can be told apart
  // from a real 404/401 below.
  const result = await prisma.invitation.updateMany({
    where: { id, version: parsed.data.version },
    data: { ...data, version: { increment: 1 } },
  });

  if (result.count === 0) {
    // Ownership and existence were confirmed by `findOwnedInvitation`
    // above, but that was a moment ago — `updateMany` matching zero rows
    // here means either (a) `version` no longer matches (someone else, or
    // this same tab left open elsewhere, saved in between), or (b) the row
    // was deleted entirely by a concurrent DELETE in that same window.
    // Re-reading tells the two apart: only (a) is a real 409 worth telling
    // the couple to reload for — (b) is just the ordinary "doesn't exist"
    // 404 every other route already uses `findOwnedInvitation` for.
    const current = await prisma.invitation.findUnique({
      where: { id },
      select: { version: true },
    });
    if (!current) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "Thiệp đã được chỉnh sửa ở nơi khác. Hãy tải lại trang để lấy bản mới nhất.",
        currentVersion: current.version,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ savedAt: Date.now(), version: parsed.data.version + 1 });
}

/**
 * Deletes an invitation the caller owns. `Guest`/`Wish`/`FormSubmission`
 * rows cascade-delete via their `onDelete: Cascade` relation to
 * `Invitation` in schema.prisma, so nothing else needs to be cleaned up
 * here.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  await prisma.invitation.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
