import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { auth } from "@/auth";

const NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";
const INVALID_DOCUMENT_MESSAGE = "Dữ liệu thiệp không hợp lệ, vui lòng thử lại.";

const patchBodySchema = z.object({
  document: InvitationDocumentSchema,
});

/**
 * Owner-only fetch of the editor's working copy. 404 (never 403) whenever
 * the invitation doesn't exist OR belongs to a different user — the two
 * cases are indistinguishable to the caller on purpose, so a guessed id
 * can't be used to probe which ids exist.
 */
async function findOwnedInvitation(id: string, ownerId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== ownerId) {
    return null;
  }
  return invitation;
}

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

  await prisma.invitation.update({
    where: { id },
    data: { document: parsed.data.document },
  });

  return NextResponse.json({ savedAt: Date.now() });
}
