import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible object storage. MinIO locally, Cloudflare R2 in production —
 * both speak the same API, so only the env values change between them.
 */

// No current caller (the server always writes `.webp`, never the source
// extension) — kept for Phase 2's audio task, which will need the same
// content-type → extension mapping the deleted `createSignedUploadUrl` used.
export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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
 * Uploads one object and returns its public URL. The server is the only
 * writer now (the browser used to PUT directly to a signed URL) — this is
 * the entire remaining surface of that direct-storage integration:
 * everything else (key naming, per-variant fan-out, ordering against the
 * `MediaAsset` row) lives in `upload.ts`.
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = requireEnv("R2_BUCKET");
  const publicBaseUrl = requireEnv("R2_PUBLIC_URL");
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    })
  );
  return `${publicBaseUrl}/${key}`;
}
