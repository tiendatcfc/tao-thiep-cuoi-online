import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { MAX_FONT_SIZE_BYTES, fontExtensionOf, fontObjectKey } from "@/lib/font";
import { FontParseError, parseAndConvertFont } from "@/lib/font-server";
import { putObject } from "@/lib/storage";
import { ASSET_QUOTA_MESSAGE, isWithinAssetQuota } from "@/lib/storage-quota";
import { rateLimitUser, USER_RATE_LIMIT_MESSAGE } from "@/lib/user-rate-limit";

/**
 * Same margin and reasoning as the image and audio routes:
 * `request.formData()` buffers the ENTIRE multipart body before `file.size`
 * can be read, so the declared content-length is what actually bounds
 * memory. The margin covers the multipart wrapper around a legitimate file.
 */
const CONTENT_LENGTH_MARGIN_BYTES = 1 * 1024 * 1024;

const SIZE_ERROR = "Kích thước file font tối đa là 5MB.";
const TYPE_ERROR = "Định dạng font phải là TTF, OTF hoặc WOFF2.";

/**
 * Upload a custom font (spec feature 16).
 *
 * Unlike the audio upload, everything happens in this request: parsing and
 * WOFF2 conversion take milliseconds on a file this size, so there is
 * nothing worth the round trip through a queue — and no background stage
 * means the `MediaAsset` is written straight to `status: "ready"` rather
 * than left on the column's `pending` default, which for images used to
 * make every upload match the operations runbook's stuck-asset query.
 *
 * The route does NOT touch the invitation document. It returns the family
 * name and URL, and the editor decides whether to add them to
 * `theme.customFonts` — keeping the document the editor store's business
 * alone, as every other upload does.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để tải font lên." }, { status: 401 });
  }
  const userId = session.user.id;

  // Font parsing runs untrusted binary through fontkit and wawoff2.
  if (!(await rateLimitUser("fontUpload", userId))) {
    return NextResponse.json({ error: USER_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // Also before the body is read. `rateLimitUser` above bounds the RATE;
  // nothing bounded the TOTAL, so an account could keep uploading at the
  // permitted rate forever. See `storage-quota.ts` for the numbers.
  if (!(await isWithinAssetQuota("font", userId))) {
    return NextResponse.json({ error: ASSET_QUOTA_MESSAGE.font }, { status: 429 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  if (declaredLength > MAX_FONT_SIZE_BYTES + CONTENT_LENGTH_MARGIN_BYTES) {
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

  // The filename's extension, not `file.type`: browsers disagree about font
  // MIME types badly enough that the declared type is useless as a filter
  // (the same .ttf arrives as font/ttf, application/x-font-ttf or
  // application/octet-stream depending on the machine).
  const extension = fontExtensionOf(file.name);
  if (!extension) {
    return NextResponse.json({ error: TYPE_ERROR }, { status: 400 });
  }
  if (file.size > MAX_FONT_SIZE_BYTES) {
    return NextResponse.json({ error: SIZE_ERROR }, { status: 400 });
  }

  // fontkit failing to parse IS the "are these bytes really a font" check,
  // exactly as sharp is for an uploaded image. It runs before anything is
  // written, so a rejected file leaves no object and no row behind.
  let converted;
  try {
    converted = await parseAndConvertFont(Buffer.from(await file.arrayBuffer()), extension);
  } catch (error) {
    if (error instanceof FontParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("font upload: unexpected parse failure:", error);
    return NextResponse.json({ error: "Không xử lý được file font, vui lòng thử lại." }, { status: 500 });
  }

  const assetId = randomUUID();
  const key = fontObjectKey(userId, assetId);

  let url: string;
  try {
    url = await putObject(key, converted.woff2, "font/woff2");
  } catch (error) {
    // Storage first, database second — a failure must never leave a
    // MediaAsset row pointing at an object that was never written.
    console.error("font upload: putObject failed:", error);
    return NextResponse.json({ error: "Không thể tải font lên, vui lòng thử lại." }, { status: 500 });
  }

  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      userId,
      kind: "font",
      url,
      status: "ready",
      meta: {
        family: converted.family,
        missingGlyphs: converted.missingGlyphs,
        sourceFilename: file.name,
        sourceSizeBytes: file.size,
        woff2SizeBytes: converted.woff2.byteLength,
      },
    },
  });

  return NextResponse.json({
    assetId,
    url,
    family: converted.family,
    // "" when the font covers the whole Vietnamese sample. The editor turns
    // a non-empty value into a warning; it is never a reason to refuse.
    missingGlyphs: converted.missingGlyphs,
  });
}
