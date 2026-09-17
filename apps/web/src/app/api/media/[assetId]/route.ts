import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";

/**
 * Status of one uploaded media asset, polled by the editor while apps/worker
 * transcodes it.
 *
 * Returns 404 — never 403 — for both "does not exist" and "belongs to someone
 * else", with an identical body, matching the convention every other
 * owner-scoped route here uses: a distinguishable response would let a
 * stranger probe which asset ids are real.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== session.user.id) {
    return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
  }

  return NextResponse.json(
    {
      status: asset.status,
      // Only a finished track is playable. Until then `url` still holds the
      // raw upload, and `meta.error` holds ffmpeg's stderr — which names
      // server filesystem paths and stays server-side.
      url: asset.status === "ready" ? asset.url : null,
    },
    // Polled every couple of seconds until the status changes; a cached
    // response would leave the editor stuck on "Đang xử lý…" forever.
    { headers: { "cache-control": "no-store" } },
  );
}
