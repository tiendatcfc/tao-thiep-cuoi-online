import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Next.js auto-loads `.env`/`.env.local` for `next dev`/`next build`, but
 * plain `vitest run` doesn't — until this task, no test needed `DATABASE_URL`
 * or `REDIS_URL`, so nothing populated `process.env` for the test process.
 * Task 10's wishes tests hit the real dev Postgres/Redis (no mocking), so
 * this loads the same two files Next reads, by hand (no extra dependency):
 * `.env` first, then `.env.local` overriding it — mirroring Next's own
 * precedence — while never clobbering a variable the shell/CI already set.
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    target[key] = value;
  }
}

function loadTestEnv() {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const fromFiles: Record<string, string> = {};
  loadDotEnvFile(`${dir}/.env`, fromFiles);
  loadDotEnvFile(`${dir}/.env.local`, fromFiles);
  for (const [key, value] of Object.entries(fromFiles)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadTestEnv();

export default defineConfig({
  // The project's tsconfig.json sets `jsx: "preserve"` so Next's own SWC
  // pipeline can do the JSX transform at build time. Vite (via its oxc
  // transformer) would otherwise inherit that "preserve" setting from
  // tsconfig and refuse to compile JSX in test files at all ("Unexpected
  // JSX expression"), so it's overridden here just for the test runner.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    // Mirrors tsconfig.json's `paths: { "@/*": ["./src/*"] } — Vite doesn't
    // read tsconfig path mappings on its own.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    // AlbumSection imports yet-another-react-lightbox's stylesheet at
    // module scope, so any test that renders it (transitively, e.g. via
    // InvitePage) makes Vite touch its CSS pipeline. Without this, Vite
    // auto-discovers the project's postcss.config.mjs — written for Tailwind
    // v4's Next.js integration, whose `plugins: ["@tailwindcss/postcss"]`
    // bare-string shorthand only Next's own PostCSS loader understands, not
    // plain postcss-load-config — and fails to load it. Styling has no
    // bearing on component tests, so an inline empty PostCSS config here
    // sidesteps that lookup entirely rather than trying to make the real
    // config portable to Vite.
    postcss: { plugins: [] },
  },
  test: {
    environment: "node",
    // .tsx tests render React components and need a DOM; they opt into
    // jsdom individually via a `// @vitest-environment jsdom` docblock at
    // the top of the file. Plain .ts lib tests stay on the faster "node"
    // environment set above.
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
  },
});
