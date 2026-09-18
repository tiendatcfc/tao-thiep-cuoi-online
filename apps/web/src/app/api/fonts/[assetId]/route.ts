import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { fontObjectKey } from "@/lib/font";
import { deleteObject } from "@/lib/storage";

/**
 * Delete one of the caller's own uploaded fonts.
 *
 * 404 — never 403 — for "does not exist", "belongs to someone else" and
 * "is not a font", with an identical body for all three, matching every
 * other owner-scoped route here: a distinguishable response would let a
 * stranger probe which asset ids are real.
 *
 * The `kind` check is what keeps this from becoming a general-purpose asset
 * deleter. Without it, passing an image id would remove a photo out of a
 * published album through a route named `/api/fonts`.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const userId = session.user.id;

  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== userId || asset.kind !== "font") {
    return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
  }

  // Object first, row second — the mirror of the upload ordering. If the
  // storage delete fails the row survives, so the font is still listed and
  // the user can try again; dropping the row first would strand the object
  // with nothing left pointing at it.
  try {
    await deleteObject(fontObjectKey(userId, assetId));
  } catch (error) {
    console.error("font delete: deleteObject failed:", error);
    return NextResponse.json({ error: "Không xoá được font, vui lòng thử lại." }, { status: 500 });
  }

  await prisma.mediaAsset.delete({ where: { id: assetId } });

  return NextResponse.json({ ok: true });
}
