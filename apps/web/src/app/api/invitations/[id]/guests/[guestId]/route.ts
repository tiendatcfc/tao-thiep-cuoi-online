import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { findOwnedInvitation, NOT_FOUND_MESSAGE } from "@/lib/ownership";
import { normalizeGuestName } from "@/lib/guest-links";

const UNAUTHENTICATED_MESSAGE = "Bạn cần đăng nhập.";
const INVALID_BODY_MESSAGE = "Dữ liệu gửi lên không hợp lệ.";

const GUEST_SELECT = {
  id: true,
  name: true,
  group: true,
  note: true,
  token: true,
  viewedAt: true,
  createdAt: true,
} as const;

const updateGuestSchema = z.object({
  name: z.string().max(1000).optional(),
  group: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Resolves a guest only when it belongs to an invitation the session user
 * owns — mirrors `wishes/[wishId]/route.ts`'s two-step check (owned
 * invitation, then child row scoped to that invitation's id) so a guestId
 * that exists but hangs off someone else's invitation, or off a *different*
 * invitation of the same owner, can't be read/edited/deleted through the
 * wrong URL.
 */
async function findOwnedGuest(invitationId: string, guestId: string, userId: string) {
  const invitation = await findOwnedInvitation(invitationId, userId);
  if (!invitation) return null;
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.invitationId !== invitationId) return null;
  return guest;
}

/** Owner-only: edit a guest's name/group/note. The token is immutable — never part of this schema. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  const { id, guestId } = await params;
  const guest = await findOwnedGuest(id, guestId, session.user.id);
  if (!guest) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 });
  }

  const parsed = updateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 });
  }

  const data: { name?: string; group?: string | null; note?: string | null } = {};
  if (parsed.data.name !== undefined) {
    const name = normalizeGuestName(parsed.data.name);
    if (!name) {
      return NextResponse.json({ error: "Tên khách không được để trống." }, { status: 400 });
    }
    data.name = name;
  }
  if (parsed.data.group !== undefined) data.group = parsed.data.group || null;
  if (parsed.data.note !== undefined) data.note = parsed.data.note || null;

  const updated = await prisma.guest.update({
    where: { id: guestId },
    data,
    select: GUEST_SELECT,
  });
  return NextResponse.json({ guest: updated });
}

/** Owner-only: remove a guest (and, downstream, their personalized link stops resolving). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  const { id, guestId } = await params;
  const guest = await findOwnedGuest(id, guestId, session.user.id);
  if (!guest) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  await prisma.guest.delete({ where: { id: guestId } });
  return NextResponse.json({ ok: true });
}
