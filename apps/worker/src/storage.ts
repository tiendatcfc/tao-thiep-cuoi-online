import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible object storage for the worker — MinIO locally, Cloudflare R2
 * in production, exactly the same env vars apps/web reads. Deliberately a
 * separate client from the web app's: the two run as separate processes and
 * sharing a module would mean the worker importing Next-flavoured code.
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
 * Streams one object to a local path.
 *
 * Streamed rather than buffered: the source is a file a user chose, up to
 * 15MB each, and holding several concurrent jobs' worth in memory is
 * avoidable waste when ffmpeg needs a real file on disk anyway.
 */
export async function downloadToFile(key: string, destinationPath: string): Promise<void> {
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET"), Key: key }),
  );
  if (!result.Body) {
    throw new Error(`Object "${key}" has no body`);
  }
  // `pipeline` (not `.pipe`) so a mid-transfer failure rejects instead of
  // leaving a truncated file that ffmpeg would then report as corrupt audio,
  // hiding a network problem behind a misleading "not valid audio" error.
  await pipeline(result.Body as Readable, createWriteStream(destinationPath));
}

/** Uploads a local file and returns its public URL. */
export async function uploadFile(key: string, sourcePath: string, contentType: string): Promise<string> {
  const body = await readFile(sourcePath);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
  return `${requireEnv("R2_PUBLIC_URL")}/${key}`;
}
