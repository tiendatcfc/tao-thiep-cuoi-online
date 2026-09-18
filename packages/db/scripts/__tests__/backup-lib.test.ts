import { describe, expect, it } from "vitest";
import {
  assertSeparateBackupBucket,
  backupObjectKey,
  BackupConfigError,
  isCustomFormatDump,
  parseRetain,
  selectKeysToPrune,
} from "../backup-lib";

describe("backupObjectKey", () => {
  it("names a dump after its UTC instant", () => {
    expect(backupObjectKey(new Date("2026-09-18T02:30:00.000Z"))).toBe(
      "backups/hpwd-2026-09-18T02-30-00-000Z.dump",
    );
  });

  // Pruning sorts keys as strings, so this ordering property is what makes
  // "keep the newest 14" mean "keep the 14 most recent".
  it("sorts by time when sorted as text", () => {
    const keys = [
      backupObjectKey(new Date("2026-09-18T02:00:00Z")),
      backupObjectKey(new Date("2026-09-17T23:00:00Z")),
      backupObjectKey(new Date("2026-10-01T00:00:00Z")),
    ];
    expect([...keys].sort()).toEqual([keys[1], keys[0], keys[2]]);
  });
});

describe("selectKeysToPrune", () => {
  const keys = Array.from({ length: 20 }, (_, day) =>
    backupObjectKey(new Date(Date.UTC(2026, 8, day + 1, 2, 0, 0))),
  );

  it("keeps the newest N and returns the rest", () => {
    const pruned = selectKeysToPrune(keys, 14);
    expect(pruned).toHaveLength(6);
    // The six oldest, i.e. 1–6 September.
    expect(pruned.sort()).toEqual(keys.slice(0, 6));
  });

  it("returns nothing when there are fewer backups than the limit", () => {
    expect(selectKeysToPrune(keys.slice(0, 3), 14)).toEqual([]);
  });

  it("does not care what order the listing arrived in", () => {
    const shuffled = [...keys].reverse();
    expect(selectKeysToPrune(shuffled, 14).sort()).toEqual(keys.slice(0, 6));
  });

  // Deleting everything is not a retention policy.
  it("refuses to keep zero", () => {
    expect(() => selectKeysToPrune(keys, 0)).toThrow();
  });
});

describe("isCustomFormatDump", () => {
  it("accepts the PGDMP magic pg_dump --format=custom writes", () => {
    expect(isCustomFormatDump(new TextEncoder().encode("PGDMP"))).toBe(true);
  });

  // pg_dump can exit 0 and still produce something useless: a dump of the
  // wrong, empty database, or a truncated stream. A plausible file in the
  // bucket is worse than a missing one — it is the file someone reaches for
  // during an incident.
  it.each([
    ["", "an empty file"],
    ["-- PostgreSQL database dump", "a plain-text dump, i.e. the wrong --format"],
    ["<?xml version", "an error page a proxy substituted"],
  ])("rejects %s (%s)", (content) => {
    expect(isCustomFormatDump(new TextEncoder().encode(content))).toBe(false);
  });
});

describe("assertSeparateBackupBucket", () => {
  it("accepts a bucket of its own", () => {
    expect(assertSeparateBackupBucket("hpwd-backups", "hpwd")).toBe("hpwd-backups");
  });

  // init-bucket.mjs grants anonymous s3:GetObject on <bucket>/*, every key,
  // because invitation pages embed photo URLs directly. A dump in there is
  // the user table, every guest list and every bank account, downloadable
  // by anyone who guesses one filename. There is no safe prefix inside it.
  it("refuses to write dumps into the world-readable media bucket", () => {
    expect(() => assertSeparateBackupBucket("hpwd", "hpwd")).toThrow(BackupConfigError);
  });

  it("refuses to run with no destination configured at all", () => {
    expect(() => assertSeparateBackupBucket(undefined, "hpwd")).toThrow(BackupConfigError);
  });
});

describe("parseRetain", () => {
  it("defaults to the 14 the spec asks for", () => {
    expect(parseRetain(undefined)).toBe(14);
    expect(parseRetain("")).toBe(14);
  });

  it("takes a configured count", () => {
    expect(parseRetain("30")).toBe(30);
  });

  // Silently falling back on a typo would quietly change how much history
  // exists, and nobody finds out until they need it.
  it.each(["0", "-1", "abc", "7.5"])("rejects %s", (raw) => {
    expect(() => parseRetain(raw)).toThrow(BackupConfigError);
  });
});
