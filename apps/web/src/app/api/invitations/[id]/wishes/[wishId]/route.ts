import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";

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
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation) {
    return NextResponse.json({ error: "Không tìm thấy thiệp." }, { status: 404 });
  }
  if (invitation.userId !== session.user.id) {
    return NextResponse.json({ error: "Bạn không có quyền với thiệp này." }, { status: 403 });
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
