import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ImageDecodeError, processAndStoreImage } from "@/lib/upload";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Multipart image upload: the server, not the browser, is now the only
 * writer to storage (see `src/lib/upload.ts` and `src/lib/storage.ts`'s
 * `putObject`) — this route decodes+resizes every upload via `processImage`
 * and returns real dimensions/blur placeholder instead of a signed PUT URL.
 * The declared `file.type`/`file.size` checks below are a cheap UX
 * pre-filter only; the real "is this actually an image" check is sharp
 * failing (or not) to decode it inside `processAndStoreImage`.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để tải ảnh lên." }, { status: 401 });
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

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Định dạng ảnh phải là JPEG, PNG hoặc WebP." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "Kích thước ảnh tối đa là 10MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processAndStoreImage({ userId: session.user.id, buffer, sourceContentType: file.type });
  } catch (err) {
    // sharp failing to decode means the bytes are not a real image, whatever
    // the declared MIME said — a client error, not a server one.
    if (err instanceof ImageDecodeError) {
      return NextResponse.json({ error: "Tệp không phải là ảnh hợp lệ, vui lòng thử lại." }, { status: 400 });
    }
    console.error("processAndStoreImage failed:", err);
    return NextResponse.json({ error: "Không thể tải ảnh lên, vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json(processed);
}
