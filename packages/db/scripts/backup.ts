/**
 * Nightly database backup: `pg_dump` → object storage, keeping the newest
 * `BACKUP_RETAIN` (default 14, per spec section 6).
 *
 *   pnpm backup:db
 *
 * Required env: DATABASE_URL, BACKUP_BUCKET, and the R2_* credentials.
 * `PG_DUMP_BIN` overrides which binary is used, for hosts where it is not
 * on PATH (`/usr/lib/postgresql/16/bin/pg_dump`) or where it runs in a
 * container.
 *
 * THE DESTINATION IS NOT THE MEDIA BUCKET, and the script refuses to start
 * if it is pointed there — see `assertSeparateBackupBucket`.
 *
 * Restoring is `restore.ts`. A backup nobody has ever restored is not a
 * backup, so run that at least once before believing this one.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertSeparateBackupBucket,
  backupObjectKey,
  BACKUP_PREFIX,
  BackupConfigError,
  isCustomFormatDump,
  parseRetain,
  selectKeysToPrune,
} from "./backup-lib";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new BackupConfigError(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

function runPgDump(databaseUrl: string, outputPath: string): Promise<void> {
  const bin = process.env.PG_DUMP_BIN ?? "pg_dump";
  return new Promise((resolve, reject) => {
    // `--format=custom` is compressed and is what `pg_restore` reads; the
    // connection string is passed as an argument rather than through the
    // environment so the failure mode of a missing DATABASE_URL is a clear
    // pg_dump error rather than a dump of whatever database the ambient
    // PG* variables happen to name.
    const child = spawn(
      bin,
      ["--format=custom", "--no-owner", "--no-privileges", "--file", outputPath, databaseUrl],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      // No upload and no pruning follow a failure: an empty or partial
      // dump written over a good history is worse than one missed night.
      reject(new Error(`pg_dump thoát với mã ${code}. Không upload, không xoá bản cũ.`));
    });
  });
}

async function readHead(path: string, bytes: number): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const bucket = assertSeparateBackupBucket(process.env.BACKUP_BUCKET, process.env.R2_BUCKET);
  const retain = parseRetain(process.env.BACKUP_RETAIN);

  const client = new S3Client({
    endpoint: requireEnv("R2_ENDPOINT"),
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  const workDir = await mkdtemp(join(tmpdir(), "hpwd-backup-"));
  const dumpPath = join(workDir, "dump");

  try {
    console.log(`[backup] pg_dump → ${dumpPath}`);
    await runPgDump(databaseUrl, dumpPath);

    const { size } = await stat(dumpPath);
    if (!isCustomFormatDump(await readHead(dumpPath, 5))) {
      throw new Error(
        `Bản dump không bắt đầu bằng "PGDMP" (${size} byte) — pg_dump thoát 0 nhưng thứ nó tạo ra không dùng được. Không upload.`,
      );
    }

    const key = backupObjectKey(new Date());
    console.log(`[backup] upload ${size} byte → ${bucket}/${key}`);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(dumpPath),
        ContentLength: size,
        ContentType: "application/octet-stream",
      }),
    );

    // Only now. Pruning before the upload lands means a network failure
    // between the two leaves the oldest backup deleted with nothing put in
    // its place.
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX }),
    );
    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((k): k is string => typeof k === "string");
    const stale = selectKeysToPrune(keys, retain);

    if (stale.length > 0) {
      console.log(`[backup] xoá ${stale.length} bản cũ, giữ lại ${retain}`);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: stale.map((k) => ({ Key: k })) },
        }),
      );
    }

    // `keys` is the listing taken AFTER the upload, so it already counts
    // the new dump; adding one more would report a history longer than
    // what is in the bucket.
    console.log(`[backup] xong: ${key} (${keys.length - stale.length} bản đang giữ)`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("[backup] THẤT BẠI:", error instanceof Error ? error.message : error);
  // A non-zero exit is what makes cron mail the operator, and what a
  // supervisor or CI step keys off. Never swallow.
  process.exit(1);
});
