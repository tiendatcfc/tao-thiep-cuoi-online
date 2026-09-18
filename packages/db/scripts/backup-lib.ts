/**
 * The decisions a database backup has to get right, separated from the
 * process spawning and network calls in `backup.ts` so each one can be
 * tested on its own.
 */

/** Spec section 6: "pg_dump hằng đêm đẩy lên R2, giữ 14 bản". */
export const DEFAULT_RETAIN = 14;

export const BACKUP_PREFIX = "backups/";

/**
 * Key for one dump. The timestamp is ISO-8601 in UTC with `:` replaced,
 * which S3 keys tolerate poorly, so sorting the keys as STRINGS sorts them
 * by time — which is what the pruning below relies on, and why a local
 * timestamp or a `DD-MM-YYYY` layout would be a bug rather than a
 * preference.
 */
export function backupObjectKey(at: Date): string {
  return `${BACKUP_PREFIX}hpwd-${at.toISOString().replace(/[:.]/g, "-")}.dump`;
}

/**
 * Which keys to delete so that `retain` newest survive.
 *
 * The caller must only run this AFTER the new dump has been uploaded
 * successfully. Pruning first would mean a network failure in between
 * leaves the oldest backup gone with nothing put in its place — and on a
 * bad enough day, repeated failures quietly empty the whole history.
 */
export function selectKeysToPrune(keys: readonly string[], retain: number): string[] {
  if (retain < 1) throw new Error(`Số bản giữ lại phải >= 1, nhận được ${retain}`);
  return [...keys].sort().reverse().slice(retain);
}

/**
 * `pg_dump --format=custom` output starts with the five bytes "PGDMP".
 *
 * Checked because `pg_dump` can exit 0 and still hand back something
 * useless — a dump of the wrong (empty) database, or a truncated stream —
 * and a plausible-looking file in the bucket is worse than a missing one:
 * it is the file someone will reach for during an incident, having been
 * told for months that backups were running fine.
 */
export function isCustomFormatDump(head: Uint8Array): boolean {
  const magic = [0x50, 0x47, 0x44, 0x4d, 0x50]; // "PGDMP"
  return magic.every((byte, index) => head[index] === byte);
}

export class BackupConfigError extends Error {}

/**
 * Refuses to write dumps into the media bucket.
 *
 * `apps/web/scripts/init-bucket.mjs` attaches a policy granting anonymous
 * `s3:GetObject` on `<bucket>/*` — EVERY key, not a prefix — because
 * invitation pages embed photo and audio URLs directly. A database dump
 * put there is the entire user table, every guest list, every phone number
 * and every bank account, downloadable by anyone who guesses one filename.
 * There is no safe prefix inside that bucket, so the only correct answer is
 * a different bucket.
 */
export function assertSeparateBackupBucket(
  backupBucket: string | undefined,
  mediaBucket: string | undefined,
): string {
  if (!backupBucket) {
    throw new BackupConfigError(
      "Thiếu BACKUP_BUCKET. Bản dump database PHẢI nằm ở bucket riêng, không phải bucket chứa ảnh/nhạc — bucket đó cho phép cả thế giới đọc mọi object.",
    );
  }
  if (mediaBucket && backupBucket === mediaBucket) {
    throw new BackupConfigError(
      `BACKUP_BUCKET và R2_BUCKET đang trùng nhau ("${backupBucket}"). Bucket media cho phép anonymous s3:GetObject trên mọi key, nên đổ dump vào đó là công khai toàn bộ database.`,
    );
  }
  return backupBucket;
}

export function parseRetain(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_RETAIN;
  const retain = Number(raw);
  if (!Number.isInteger(retain) || retain < 1) {
    throw new BackupConfigError(`BACKUP_RETAIN phải là số nguyên >= 1, nhận được "${raw}"`);
  }
  return retain;
}
