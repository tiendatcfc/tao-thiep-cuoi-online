import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
