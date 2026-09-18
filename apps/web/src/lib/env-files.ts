import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Next loads BOTH `.env` and `.env.local` from the app directory, and
 * `.env.local` wins every key it defines. When both exist, editing `.env`
 * therefore does nothing — no error, no warning, no hint: the app simply
 * keeps running on the other file's values.
 *
 * This repository has had both files, byte-for-byte identical, since the
 * Google OAuth credentials were added. HANDOFF carries it as a configuration
 * trap because someone already lost time to it.
 *
 * Neither file is deleted here — they hold real secrets and it is not this
 * code's call which copy is the good one. The point is only that the trap
 * stops being silent.
 */
export interface EnvFileConflict {
  /** Keys defined in `.env` whose value `.env.local` overrides. */
  shadowedKeys: string[];
  /** True when the two files are byte-identical — a trap that has not sprung yet. */
  identical: boolean;
}

/** Keys only. Values are never read out of here, so nothing can print a secret. */
function keysOf(contents: string): Set<string> {
  const keys = new Set<string>();
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // `export FOO=bar` is valid in these files (dotenv strips the prefix)
    // and this repo's own .env uses it for NODE_EXTRA_CA_CERTS.
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = withoutExport.indexOf("=");
    if (eq > 0) keys.add(withoutExport.slice(0, eq).trim());
  }
  return keys;
}

export function detectEnvFileConflict(dir: string): EnvFileConflict | null {
  const base = path.join(dir, ".env");
  const local = path.join(dir, ".env.local");
  if (!existsSync(base) || !existsSync(local)) return null;

  const baseContents = readFileSync(base, "utf8");
  const localContents = readFileSync(local, "utf8");
  const localKeys = keysOf(localContents);

  return {
    shadowedKeys: [...keysOf(baseContents)].filter((key) => localKeys.has(key)).sort(),
    identical: baseContents === localContents,
  };
}

/**
 * Called from `next.config.ts`, so it runs once per `next dev` / `next build`
 * rather than per request.
 *
 * Only key NAMES are printed. A warning that leaked the values would be a
 * worse problem than the one it reports, and these files hold the OAuth
 * client secret and the storage keys.
 */
export function warnAboutEnvFileConflict(dir: string, log: (message: string) => void = console.warn): void {
  const conflict = detectEnvFileConflict(dir);
  if (!conflict || conflict.shadowedKeys.length === 0) return;

  log(
    [
      "",
      "  apps/web has BOTH .env and .env.local, and .env.local wins.",
      conflict.identical
        ? "  They are identical right now, so nothing is broken yet — but the next"
        : "  Their contents already differ, so this is live:",
      conflict.identical
        ? "  edit to .env will be ignored without any error."
        : "  .env is being ignored for the keys below.",
      `  Shadowed keys: ${conflict.shadowedKeys.join(", ")}`,
      "  Keep one file. .env.local is the one Next actually reads.",
      "",
    ].join("\n"),
  );
}
