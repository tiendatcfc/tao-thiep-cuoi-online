import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { enqueueBgRemovalJob } from "@/lib/queues";
import { imageVariantKey } from "@/lib/upload";
import { ASSET_QUOTA_MESSAGE, isWithinAssetQuota } from "@/lib/storage-quota";
import { rateLimitUser, USER_RATE_LIMIT_MESSAGE } from "@/lib/user-rate-limit";

/**
 * Queue an AI background removal for one of the caller's own photos (spec
 * feature 15).
 *
 * Creates a SECOND `MediaAsset` rather than overwriting the first. "Xoá nền"
 * is a destructive-looking operation on a wedding photo, and the couple has
 * to be able to go back — so the original object and row are never touched,
 * and the editor swaps the URL only once the cut-out is ready.
 *
 * The work itself happens in `apps/worker`: inference takes seconds and would
 * hold a request (or a serverless invocation) open the whole time. This route
 * hands over and returns immediately; the editor polls
 * `GET /api/media/[assetId]`, which already existed for the audio flow.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const userId = session.user.id;

  // rembg runs at concurrency 1, so this is the one route where a single
  // user can starve everyone else's jobs rather than just their own.
  if (!(await rateLimitUser("backgroundRemoval", userId))) {
    return NextResponse.json({ error: USER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // The cutout is a NEW image asset, never an overwrite, so this route grows
  // the account's asset count exactly like an upload does and has to answer
  // to the same total.
  if (!(await isWithinAssetQuota("image", userId))) {
    return NextResponse.json({ error: ASSET_QUOTA_MESSAGE.image }, { status: 429 });
  }

  // Identified by URL, not by asset id. The invitation document stores only
  // URLs, so after a page reload the editor has no id to send — a field that
  // could only offer this immediately after an upload, and lost the button
  // on refresh, would be worse than not having it.
  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url) {
      return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
    }
    url = body.url;
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  // Scoped to the caller in the query itself, so "no such image" and
  // "someone else's image" collapse into one indistinguishable 404 by
  // construction rather than by a later branch that could be forgotten.
  // Never 403: a distinguishable response would let a stranger probe which
  // stored URLs are real.
  const source = await prisma.mediaAsset.findFirst({ where: { userId, url } });
  if (!source) {
    return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
  }
  if (source.kind !== "image") {
    return NextResponse.json({ error: "Chỉ xoá nền được cho ảnh." }, { status: 400 });
  }
  if (source.status !== "ready") {
    // A half-processed source would be downloaded as a truncated object, or
    // not exist yet at all.
    return NextResponse.json({ error: "Ảnh chưa xử lý xong, vui lòng thử lại sau." }, { status: 409 });
  }

  const meta = (source.meta ?? {}) as {
    variants?: { width: number; url: string }[];
    width?: number;
    height?: number;
  };
  // The largest stored variant: the model works from the most detail
  // available, and every variant shares the source aspect ratio, so the
  // cut-out lines up with whatever the document already records.
  const largest = [...(meta.variants ?? [])].sort((a, b) => b.width - a.width)[0];
  if (!largest) {
    return NextResponse.json({ error: "Ảnh này không có bản gốc để xử lý." }, { status: 400 });
  }
  const sourceKey = imageVariantKey(userId, source.id, largest.width);

  const targetAssetId = randomUUID();
  await prisma.mediaAsset.create({
    data: {
      id: targetAssetId,
      userId,
      kind: "image",
      // Empty until the worker writes the real one. `GET /api/media/[assetId]`
      // returns `url: null` for anything not "ready", so nothing can render
      // this by accident in the meantime.
      url: "",
      status: "pending",
      meta: {
        sourceAssetId: source.id,
        // Carried over so the editor can keep the document's width/height
        // when it swaps the URL — rembg preserves the pixel dimensions.
        width: meta.width ?? null,
        height: meta.height ?? null,
      },
    },
  });

  try {
    await enqueueBgRemovalJob({ sourceAssetId: source.id, targetAssetId, userId, sourceKey });
  } catch (error) {
    // NOT fail-open: an unqueued job is a cut-out no worker will ever make,
    // so reporting success would leave the couple polling a status that can
    // never change.
    console.error("background removal: enqueue failed:", error);
    await prisma.mediaAsset.update({
      where: { id: targetAssetId },
      data: { status: "failed", meta: { sourceAssetId: source.id, error: "Không đưa được vào hàng đợi xử lý." } },
    });
    return NextResponse.json(
      { error: "Hệ thống xoá nền đang bận, vui lòng thử lại sau." },
      { status: 503 },
    );
  }

  // Conditional on still being "pending": the worker can finish a small
  // photo before this line runs, and an unconditional write would stamp
  // "processing" back over its "ready".
  await prisma.mediaAsset.updateMany({
    where: { id: targetAssetId, status: "pending" },
    data: { status: "processing" },
  });

  return NextResponse.json({ assetId: targetAssetId, status: "processing" });
}
