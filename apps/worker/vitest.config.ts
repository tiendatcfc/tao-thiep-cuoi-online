import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `vitest run` does not load env files, and the worker's integration tests
 * talk to the real Postgres and the real MinIO bucket. The same two files the
 * runtime scripts read are loaded here by hand (no extra dependency), never
 * clobbering a variable the shell or CI already set.
 *
 * `packages/db/.env` is where this repo already keeps DATABASE_URL and the
 * R2_* values for local development — the worker needs exactly that set, so
 * pointing at it avoids asking every developer to maintain a third copy.
 */
function loadDotEnvFile(path: string, target: Record<string, string>) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    target[key] = value;
  }
}

const dir = fileURLToPath(new URL(".", import.meta.url));
const fromFiles: Record<string, string> = {};
loadDotEnvFile(`${dir}/.env`, fromFiles);
loadDotEnvFile(`${dir}/../../packages/db/.env`, fromFiles);
for (const [key, value] of Object.entries(fromFiles)) {
  if (!(key in process.env)) process.env[key] = value;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
