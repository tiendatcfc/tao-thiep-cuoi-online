import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@hpwd/db";

/**
 * S3-compatible object storage. MinIO locally, Cloudflare R2 in production —
 * both speak the same API, so only the env values change between them.
 */

const SIGNED_UPLOAD_TTL_SECONDS = 10 * 60; // 10 minutes

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Only "image" is supported today; later tasks extend this to audio/font.
export type StorageAssetKind = "image";

export interface CreateSignedUploadUrlParams {
  userId: string;
  kind: StorageAssetKind;
  contentType: string;
  sizeBytes: number;
}

export interface CreateSignedUploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  assetId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  }
  return value;
}

let cachedClient: S3Client | undefined;

function getS3Client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: requireEnv("R2_ENDPOINT"),
      region: "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return cachedClient;
}

/**
 * Builds a time-limited signed PUT URL the client can upload directly to,
 * then records a `MediaAsset` row for it. The object key is derived from a
 * freshly generated id, so `assetId` doubles as both the DB row id and the
 * storage path segment.
 *
 * Order matters here: the S3 client/URL is built (and env validated) before
 * anything is written to the database, so a storage misconfiguration (e.g.
 * missing R2_* env) throws before any `MediaAsset` row is created — no
 * orphaned rows pointing at a URL that was never actually signed.
 */
export async function createSignedUploadUrl(
  params: CreateSignedUploadUrlParams
): Promise<CreateSignedUploadUrlResult> {
  const { userId, kind, contentType, sizeBytes } = params;

  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) {
    throw new Error(`Định dạng tệp không được hỗ trợ: ${contentType}`);
  }

  const bucket = requireEnv("R2_BUCKET");
  const publicBaseUrl = requireEnv("R2_PUBLIC_URL");

  const assetId = randomUUID();
  const key = `u/${userId}/${assetId}.${extension}`;
  const publicUrl = `${publicBaseUrl}/${key}`;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: SIGNED_UPLOAD_TTL_SECONDS,
    // The S3 presigner treats content-type/content-length as unsignable by
    // default (it would otherwise let a client PUT with any Content-Type or
    // byte count it likes, regardless of what was declared when the URL was
    // requested). Explicitly whitelisting them here forces both into
    // SignedHeaders, so the upload must match this URL's declared
    // Content-Type and Content-Length exactly, or S3/MinIO rejects it with
    // a signature mismatch.
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      userId,
      kind,
      url: publicUrl,
      meta: { contentType, sizeBytes },
    },
  });

  return { uploadUrl, publicUrl, assetId };
}
