import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { findOwnedInvitation, NOT_FOUND_MESSAGE } from "@/lib/ownership";
import { normalizeGuestName } from "@/lib/guest-links";

const MAX_GUESTS_PER_REQUEST = 500;
const UNAUTHENTICATED_MESSAGE = "Bạn cần đăng nhập.";
const INVALID_BODY_MESSAGE = "Dữ liệu gửi lên không hợp lệ.";

const guestInputSchema = z.object({
  // The raw cap here is generous headroom above `normalizeGuestName`'s
  // 120-char output limit — it just keeps a malicious/broken client from
  // sending arbitrarily large strings before normalization trims them down.
  name: z.string().max(1000),
  group: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});
const createGuestsSchema = z.object({
  guests: z.array(guestInputSchema).min(1).max(MAX_GUESTS_PER_REQUEST),
});

const GUEST_SELECT = {
  id: true,
  name: true,
  group: true,
  note: true,
  token: true,
  viewedAt: true,
  createdAt: true,
} as const;

/** Owner-only: list every guest of one invitation, newest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  const { id } = await params;
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const guests = await prisma.guest.findMany({
    where: { invitationId: id },
    select: GUEST_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ guests });
}

/**
 * Owner-only: bulk-create guests (manual entry or, later, CSV import) for one
 * invitation. Capped at `MAX_GUESTS_PER_REQUEST` per call; the whole batch is
 * validated before anything is written, so a bad row (e.g. a name that's
 * empty after normalization) rejects the entire request with nothing
 * partially created.
 *
 * Uses `createManyAndReturn` rather than `createMany` + a follow-up
 * `findMany` — the reference implementation's `createMany` then
 * `findMany({ orderBy: { createdAt: "desc" }, take: rows.length })` is
 * unreliable: `createdAt` has millisecond resolution, so inserting many rows
 * in one statement produces ties, and a `take` keyed on `createdAt desc`
 * with ties can return rows from a *different*, coincidentally-adjacent
 * batch instead of (or as well as) the one just inserted. `createManyAndReturn`
 * (Postgres, supported by the installed @prisma/client ^6.19) returns exactly
 * the rows this call inserted, in one round trip, with no such race.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  const { id } = await params;
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 });
  }

  const parsed = createGuestsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Danh sách khách không hợp lệ (tối đa ${MAX_GUESTS_PER_REQUEST} khách mỗi lần).` },
      { status: 400 },
    );
  }

  const rows = parsed.data.guests.map((guest) => ({
    invitationId: id,
    name: normalizeGuestName(guest.name),
    group: guest.group || null,
    note: guest.note || null,
  }));
  if (rows.some((row) => row.name.length === 0)) {
    return NextResponse.json({ error: "Tên khách không được để trống." }, { status: 400 });
  }

  const guests = await prisma.guest.createManyAndReturn({
    data: rows,
    select: GUEST_SELECT,
  });

  return NextResponse.json({ created: guests.length, guests }, { status: 201 });
}
