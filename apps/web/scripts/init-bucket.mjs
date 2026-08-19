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
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// HUMAN TODO: once the production domain is chosen, replace this with the
// real origin (e.g. "https://hpwd.vn") and re-run this script against the
// production R2 bucket/credentials. Left as an obviously-fake placeholder
// rather than guessed at, so a stale wrong value can't silently ship.
const PRODUCTION_ORIGIN_PLACEHOLDER = "https://REPLACE-WITH-PRODUCTION-DOMAIN.example";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * `PutBucketCors` 501ing with "NotImplemented" is expected against local
 * MinIO (it doesn't implement the per-bucket S3 CORS API — see the comment
 * at the call site) but is NOT exclusive to that: if Cloudflare R2 ever
 * rejects this exact request shape with the same code, swallowing on the
 * error code alone would warn, resolve, and exit 0 — shipping a production
 * bucket with no CORS configured, surfacing only later as a real user's
 * upload failing preflight in the browser.
 *
 * So the swallow additionally requires an explicit "this is a
 * known-CORS-unsupported dev backend" signal: either `R2_ENDPOINT` points
 * at localhost (this repo's MinIO setup), or `ALLOW_CORS_UNSUPPORTED=1` is
 * set by hand. Anything else — including a "NotImplemented" from a
 * non-local endpoint — rethrows and fails the script loudly rather than
 * silently shipping without CORS.
 */
function isKnownCorsUnsupportedBackend(endpointUrl) {
  if (process.env.ALLOW_CORS_UNSUPPORTED === "1") return true;
  try {
    const hostname = new URL(endpointUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
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
  // Newer AWS SDK v3 versions default to attaching a request checksum
  // (`x-amz-sdk-checksum-algorithm`) to most S3 calls, which some
  // S3-compatible servers choke on for less common operations — harmless
  // here either way, but this keeps requests closer to what a plain HTTP
  // client would send.
  requestChecksumCalculation: "WHEN_REQUIRED",
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

  // Images no longer need bucket CORS: the server, not the browser, is now
  // the only writer to storage (see `src/lib/upload.ts`'s
  // `processAndStoreImage` and `src/app/api/uploads/route.ts`) — there is
  // no more direct browser PUT to a presigned upload URL for this plan's
  // image flow, so nothing in production actually depends on this call
  // succeeding today.
  //
  // This config is still applied anyway: it costs nothing here, and a
  // possible Phase 2 feature (e.g. direct-from-browser audio uploads) may
  // reintroduce a presigned-PUT flow that would need it. `GET` also remains
  // harmless/useful regardless, letting a browser fetch a public object URL
  // back without a CORS error.
  //
  // This is the standard S3 bucket-CORS API and is what actually configures
  // CORS on Cloudflare R2 in production.
  //
  // Against local MinIO (confirmed on RELEASE.2025-09-07, both via this SDK
  // and MinIO's own `mc cors set`), this call itself 501s with
  // "NotImplemented": MinIO doesn't implement the per-bucket S3 CORS API at
  // all. That's not a local-dev blocker, though — MinIO applies CORS at the
  // *server* level instead, controlled by `api.cors_allow_origin`, which
  // defaults to `*` (verified with a real cross-origin `curl` OPTIONS
  // preflight, PUT, and GET straight against a presigned URL — see
  // task-16-report.md, from when this flow was still browser-driven). See
  // `isKnownCorsUnsupportedBackend` above for why this 501 is only swallowed
  // for a known-local backend, not on the error code alone. Operators
  // running an images-only deployment may reasonably decide to relax this
  // requirement entirely (e.g. always swallow "NotImplemented") — that
  // behavior change is out of scope here; this comment update is text-only.
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ["http://localhost:3000", PRODUCTION_ORIGIN_PLACEHOLDER],
              AllowedMethods: ["PUT", "GET"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      })
    );
    console.log(
      `Applied CORS configuration to "${bucket}" (http://localhost:3000 + a placeholder production origin — ` +
        `update PRODUCTION_ORIGIN_PLACEHOLDER in this script and re-run once the real production domain is known).`
    );
  } catch (err) {
    const isNotImplemented = err?.Code === "NotImplemented" || err?.name === "NotImplemented";
    if (isNotImplemented && isKnownCorsUnsupportedBackend(endpoint)) {
      console.warn(
        `CORS was NOT configured on "${bucket}": this storage backend does not implement the bucket-level S3 CORS ` +
          `API (expected for local MinIO — allowed here because R2_ENDPOINT is local, or ALLOW_CORS_UNSUPPORTED=1 ` +
          `was set). Relying on MinIO's server-level "api.cors_allow_origin" default ("*") instead — verified ` +
          `working with a real cross-origin PUT (see task-16-report.md). Production Cloudflare R2 DOES require ` +
          `this to succeed: do not set ALLOW_CORS_UNSUPPORTED against a production R2_ENDPOINT.`
      );
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("init-bucket failed:", err);
  process.exit(1);
});
