import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { MAX_AUDIO_SIZE_BYTES, audioSourceKey, isAudioContentType } from "@/lib/audio";
import { enqueueAudioJob } from "@/lib/queues";
import { putObject } from "@/lib/storage";
import { ASSET_QUOTA_MESSAGE, isWithinAssetQuota } from "@/lib/storage-quota";
import { rateLimitUser, USER_RATE_LIMIT_MESSAGE } from "@/lib/user-rate-limit";

/**
 * Same margin and reasoning as the image route: `request.formData()` buffers
 * the ENTIRE multipart body before `file.size` can be read, so the declared
 * content-length is what actually bounds memory. The margin covers the
 * multipart boundary/header bytes wrapped around a legitimately-sized file.
 */
const CONTENT_LENGTH_MARGIN_BYTES = 1 * 1024 * 1024;

const SIZE_ERROR = "Kích thước file nhạc tối đa là 15MB.";

/**
 * Upload background music.
 *
 * The browser POSTs the file to the server, which stores it and queues a
 * transcode — it does NOT receive a presigned URL and PUT to storage itself.
 * That direct-to-storage flow was deliberately retired in 7071efe ("retire
 * browser-PUT presign flow") along with the presigner dependency, and
 * reintroducing it for audio alone would mean two different upload
 * architectures in one app, plus a signed URL that lets a client write any
 * bytes it likes under its own key.
 *
 * The transcode itself is NOT done here: ffmpeg on a ~15MB file would hold a
 * request open for seconds and block a serverless invocation. apps/worker
 * does it in the background; this route hands over and returns immediately,
 * and the editor polls `GET /api/media/[assetId]`.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để tải nhạc lên." }, { status: 401 });
  }
  const userId = session.user.id;

  // Every accepted upload becomes an ffmpeg process on the worker.
  if (!(await rateLimitUser("audioUpload", userId))) {
    return NextResponse.json({ error: USER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // Also before the body is read. `rateLimitUser` above bounds the RATE;
  // nothing bounded the TOTAL, so an account could keep uploading at the
  // permitted rate forever. See `storage-quota.ts` for the numbers.
  if (!(await isWithinAssetQuota("audio", userId))) {
    return NextResponse.json({ error: ASSET_QUOTA_MESSAGE.audio }, { status: 429 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  if (declaredLength > MAX_AUDIO_SIZE_BYTES + CONTENT_LENGTH_MARGIN_BYTES) {
    return NextResponse.json({ error: SIZE_ERROR }, { status: 400 });
  }

  let file: File;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
    }
    file = candidate;
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  if (!isAudioContentType(file.type)) {
    return NextResponse.json(
      { error: "Định dạng nhạc phải là MP3 hoặc M4A." },
      { status: 400 },
    );
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json({ error: SIZE_ERROR }, { status: 400 });
  }

  // Nothing here validates that the bytes really are audio — the declared
  // type is only a cheap filter. ffmpeg in the worker is the real check, and
  // a file it cannot decode ends up as status "failed" with its stderr in
  // meta.error rather than as a broken <audio> src.
  const assetId = randomUUID();
  const contentType = file.type;
  const sourceKey = audioSourceKey(userId, assetId, contentType);

  let sourceUrl: string;
  try {
    sourceUrl = await putObject(sourceKey, Buffer.from(await file.arrayBuffer()), contentType);
  } catch (error) {
    // Storage first, database second — the same ordering as the image
    // pipeline, so a failure can never leave a MediaAsset row pointing at an
    // object that was never written.
    console.error("audio upload: putObject failed:", error);
    return NextResponse.json({ error: "Không thể tải nhạc lên, vui lòng thử lại." }, { status: 500 });
  }

  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      userId,
      kind: "audio",
      // The source URL, not the final one: `GET /api/media/[assetId]` hides
      // it until the status is "ready", so nothing can play the untranscoded
      // file by accident, and the worker overwrites this on success.
      url: sourceUrl,
      status: "pending",
      meta: { sourceKey, sourceContentType: contentType, sourceSizeBytes: file.size },
    },
  });

  try {
    await enqueueAudioJob({ assetId, userId, sourceKey });
  } catch (error) {
    // NOT fail-open, unlike rate-limit.ts: if the job never reaches the
    // queue, no worker will ever transcode this file, so reporting success
    // would leave the couple polling a status that can never change.
    console.error("audio upload: enqueueAudioJob failed:", error);
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: "failed", meta: { sourceKey, sourceContentType: contentType, error: "Không đưa được vào hàng đợi xử lý." } },
    });
    return NextResponse.json(
      { error: "Hệ thống xử lý nhạc đang bận, vui lòng thử lại sau." },
      { status: 503 },
    );
  }

  // Conditional on still being "pending": the worker can pick the job up and
  // finish a short track before this line runs, and an unconditional write
  // would stamp "processing" back over its "ready".
  await prisma.mediaAsset.updateMany({
    where: { id: assetId, status: "pending" },
    data: { status: "processing" },
  });

  return NextResponse.json({ assetId, status: "processing" });
}
