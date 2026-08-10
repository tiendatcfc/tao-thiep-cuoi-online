import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createSignedUploadUrl } from "@/lib/storage";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const uploadRequestSchema = z.object({
  kind: z.literal("image"),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().positive().max(MAX_UPLOAD_SIZE_BYTES),
});

// Vietnamese messages keyed by the field that failed validation — kept
// separate from zod's own (English) issue messages so the API always
// responds in Vietnamese regardless of zod's default wording.
function messageForField(field: unknown): string {
  switch (field) {
    case "contentType":
      return "Định dạng ảnh phải là JPEG, PNG hoặc WebP.";
    case "sizeBytes":
      return "Kích thước ảnh tối đa là 10MB.";
    case "kind":
      return "Loại tệp không được hỗ trợ.";
    default:
      return "Dữ liệu gửi lên không hợp lệ.";
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để tải ảnh lên." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 }
    );
  }

  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: messageForField(field) }, { status: 400 });
  }

  const { kind, contentType, sizeBytes } = parsed.data;

  const { uploadUrl, publicUrl, assetId } = await createSignedUploadUrl({
    userId: session.user.id,
    kind,
    contentType,
    sizeBytes,
  });

  return NextResponse.json({ uploadUrl, publicUrl, assetId });
}
