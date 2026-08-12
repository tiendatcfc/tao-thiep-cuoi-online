import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { findOwnedInvitation, NOT_FOUND_MESSAGE, UNAUTHENTICATED_MESSAGE } from "@/lib/ownership";

const patchInputSchema = z.object({
  isHidden: z.boolean(),
});

/** Owner-only: hide/unhide a guest wish for moderation. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; wishId: string }> },
) {
  const { id, wishId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  // C10: this route used to hand-roll its own findUnique + userId check and
  // return a 403 for "belongs to someone else" — every other route
  // (invitations/[id], invitations/[id]/publish) uses `findOwnedInvitation`,
  // which deliberately makes "doesn't exist" and "isn't yours" both a 404,
  // so a guessed id can't be used to probe which ids exist. Migrated for
  // consistency; the wrong-owner case now returns the same 404 as a
  // nonexistent invitation instead of a distinguishing 403.
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const wish = await prisma.wish.findUnique({ where: { id: wishId } });
  if (!wish || wish.invitationId !== id) {
    return NextResponse.json({ error: "Không tìm thấy lời chúc." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const parsed = patchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const updated = await prisma.wish.update({
    where: { id: wishId },
    data: { isHidden: parsed.data.isHidden },
  });

  return NextResponse.json({
    wish: {
      id: updated.id,
      guestName: updated.guestName,
      message: updated.message,
      createdAt: updated.createdAt,
      isHidden: updated.isHidden,
    },
  });
}
