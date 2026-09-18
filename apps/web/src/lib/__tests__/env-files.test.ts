import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { detectEnvFileConflict, warnAboutEnvFileConflict } from "../env-files";

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hpwd-env-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}

describe("detectEnvFileConflict", () => {
  it("says nothing when only one of the two files exists", () => {
    expect(detectEnvFileConflict(dirWith({ ".env": "A=1" }))).toBeNull();
    expect(detectEnvFileConflict(dirWith({ ".env.local": "A=1" }))).toBeNull();
  });

  // The state this repository has actually been in: two copies, identical,
  // so nothing is wrong yet and the next edit to the wrong one vanishes.
  it("reports identical files as a conflict that has not sprung yet", () => {
    const conflict = detectEnvFileConflict(dirWith({ ".env": "A=1\nB=2\n", ".env.local": "A=1\nB=2\n" }));

    expect(conflict).toEqual({ shadowedKeys: ["A", "B"], identical: true });
  });

  it("reports only the keys .env.local actually overrides", () => {
    const conflict = detectEnvFileConflict(
      dirWith({ ".env": "SHARED=1\nONLY_IN_BASE=2\n", ".env.local": "SHARED=9\nONLY_IN_LOCAL=3\n" }),
    );

    expect(conflict).toEqual({ shadowedKeys: ["SHARED"], identical: false });
  });

  it("ignores comments and blank lines", () => {
    const conflict = detectEnvFileConflict(
      dirWith({ ".env": "# a comment\n\nA=1\n", ".env.local": "# another\n\nA=2\n" }),
    );

    expect(conflict?.shadowedKeys).toEqual(["A"]);
  });

  // This repository's own .env writes `export NODE_EXTRA_CA_CERTS=...`,
  // which dotenv accepts. Missing it would under-report the real conflict.
  it("understands the `export KEY=value` form these files are allowed to use", () => {
    const conflict = detectEnvFileConflict(
      dirWith({ ".env": "export NODE_EXTRA_CA_CERTS=/a\n", ".env.local": "export NODE_EXTRA_CA_CERTS=/b\n" }),
    );

    expect(conflict?.shadowedKeys).toEqual(["NODE_EXTRA_CA_CERTS"]);
  });
});

describe("warnAboutEnvFileConflict", () => {
  it("stays quiet when there is nothing to report", () => {
    const log = vi.fn();
    warnAboutEnvFileConflict(dirWith({ ".env": "A=1" }), log);
    expect(log).not.toHaveBeenCalled();
  });

  it("stays quiet when both files exist but share no keys", () => {
    const log = vi.fn();
    warnAboutEnvFileConflict(dirWith({ ".env": "A=1", ".env.local": "B=2" }), log);
    expect(log).not.toHaveBeenCalled();
  });

  it("names the shadowed keys and which file wins", () => {
    const log = vi.fn();
    warnAboutEnvFileConflict(dirWith({ ".env": "AUTH_SECRET=x", ".env.local": "AUTH_SECRET=y" }), log);

    const message = log.mock.calls[0]?.[0] as string;
    expect(message).toContain("AUTH_SECRET");
    expect(message).toContain(".env.local");
  });

  // A warning that leaked the values would be a worse problem than the one
  // it reports: these files hold the OAuth client secret and storage keys.
  it("never prints a value", () => {
    const log = vi.fn();
    warnAboutEnvFileConflict(
      dirWith({
        ".env": "AUTH_GOOGLE_SECRET=GOCSPX-super-secret\n",
        ".env.local": "AUTH_GOOGLE_SECRET=GOCSPX-other-secret\n",
      }),
      log,
    );

    const message = log.mock.calls[0]?.[0] as string;
    expect(message).not.toContain("GOCSPX-super-secret");
    expect(message).not.toContain("GOCSPX-other-secret");
    expect(message).not.toContain("GOCSPX");
  });
});
