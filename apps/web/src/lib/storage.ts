import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible object storage. MinIO locally, Cloudflare R2 in production —
 * both speak the same API, so only the env values change between them.
 */

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

/**
 * Removes one object. Used when a user deletes an uploaded font — without
 * it, a font they got rid of in the editor would keep occupying storage
 * (and stay publicly fetchable) forever.
 *
 * S3 delete is idempotent: removing a key that is already gone succeeds,
 * so a retry after a partial failure is safe.
 */
export async function deleteObject(key: string): Promise<void> {
  const bucket = requireEnv("R2_BUCKET");
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
