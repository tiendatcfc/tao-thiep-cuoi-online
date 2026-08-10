#!/usr/bin/env node
/**
 * Idempotent bootstrap for the object storage bucket used by
 * `src/lib/storage.ts`. MinIO in local dev, Cloudflare R2 in production —
 * both speak the S3 API, so this script works against either.
 *
 * Creates the bucket if it doesn't already exist, then attaches a
 * public-read bucket policy (anonymous `s3:GetObject`) so uploaded media is
 * fetchable at `R2_PUBLIC_URL/...` without additional signing — invitation
 * pages embed these URLs directly as <img>/<audio> src values.
 *
 * Required env: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *
 * Usage (from repo root):
 *   node --env-file=apps/web/.env.local apps/web/scripts/init-bucket.mjs
 *   pnpm dev:init   (wired to the command above)
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const endpoint = requireEnv("R2_ENDPOINT");
const bucket = requireEnv("R2_BUCKET");
const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

const client = new S3Client({
  endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function bucketExists() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound") {
      return false;
    }
    throw err;
  }
}

async function main() {
  if (await bucketExists()) {
    console.log(`Bucket "${bucket}" already exists.`);
  } else {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket "${bucket}".`);
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    })
  );
  console.log(`Applied public-read policy to "${bucket}".`);
}

main().catch((err) => {
  console.error("init-bucket failed:", err);
  process.exit(1);
});
