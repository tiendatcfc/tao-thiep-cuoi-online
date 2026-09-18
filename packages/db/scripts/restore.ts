/**
 * The other half of `backup.ts`: download one dump and load it into a
 * database.
 *
 *   pnpm restore:db <key> <target DATABASE_URL>
 *   pnpm restore:db --list
 *
 * A backup nobody has ever restored is not a backup, it is a file. This
 * script exists so the restore path is exercised on a normal day rather
 * than improvised during an incident, and `docs/operations.md` walks
 * through doing exactly that against a scratch database.
 *
 * The target is passed on the command line, NOT read from DATABASE_URL:
 * `pg_restore --clean` drops and recreates every object it touches, and
 * defaulting that to the environment's own database means one absent-minded
 * run wipes production. Making the operator type where it goes is the whole
 * safety mechanism.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { assertSeparateBackupBucket, BACKUP_PREFIX, BackupConfigError } from "./backup-lib";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new BackupConfigError(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

function makeClient(): S3Client {
  return new S3Client({
    endpoint: requireEnv("R2_ENDPOINT"),
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function runPgRestore(targetUrl: string, dumpPath: string): Promise<void> {
  const bin = process.env.PG_RESTORE_BIN ?? "pg_restore";
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", targetUrl, dumpPath],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      // pg_restore exits non-zero on warnings it considers non-fatal too,
      // so the message says "check the output" rather than claiming the
      // data did not land.
      if (code === 0) return resolve();
      reject(new Error(`pg_restore thoát với mã ${code} — đọc output ở trên trước khi kết luận.`));
    });
  });
}

async function list(client: S3Client, bucket: string): Promise<void> {
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX }),
  );
  const objects = (listed.Contents ?? []).sort((a, b) => (a.Key ?? "").localeCompare(b.Key ?? ""));
  if (objects.length === 0) {
    console.log(`Không có bản backup nào trong ${bucket}/${BACKUP_PREFIX}`);
    return;
  }
  for (const object of objects) {
    console.log(`${object.Key}\t${object.Size} byte\t${object.LastModified?.toISOString() ?? ""}`);
  }
}

async function main(): Promise<void> {
  const bucket = assertSeparateBackupBucket(process.env.BACKUP_BUCKET, process.env.R2_BUCKET);
  const client = makeClient();
  const [keyOrFlag, targetUrl] = process.argv.slice(2);

  if (!keyOrFlag || keyOrFlag === "--list") {
    await list(client, bucket);
    return;
  }

  if (!targetUrl) {
    throw new BackupConfigError(
      "Thiếu DATABASE_URL đích.\n" +
        "  pnpm restore:db <key> postgresql://user:pass@host:5432/ten_db\n" +
        "Đích phải gõ tay: pg_restore --clean xoá rồi tạo lại mọi bảng nó chạm tới.",
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "hpwd-restore-"));
  const dumpPath = join(workDir, "dump");

  try {
    console.log(`[restore] tải ${bucket}/${keyOrFlag}`);
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOrFlag }));
    if (!object.Body) throw new Error(`Object rỗng: ${keyOrFlag}`);
    await pipeline(object.Body as Readable, createWriteStream(dumpPath));

    const { size } = await stat(dumpPath);
    console.log(`[restore] ${size} byte → pg_restore`);
    await runPgRestore(targetUrl, dumpPath);
    console.log("[restore] xong.");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("[restore] THẤT BẠI:", error instanceof Error ? error.message : error);
  process.exit(1);
});
