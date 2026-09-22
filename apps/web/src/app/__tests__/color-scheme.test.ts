import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Comments stripped before matching: the rules below are about what the
 * stylesheet DOES, and the comment explaining why the dark block was
 * removed naturally quotes the very string being forbidden.
 */
const GLOBALS_CSS = readFileSync(fileURLToPath(new URL("../globals.css", import.meta.url)), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const SRC_DIR = fileURLToPath(new URL("../..", import.meta.url));

/**
 * This app is light-only, deliberately, and the failure mode of pretending
 * otherwise is not "it looks a bit different" — it is a dashboard whose
 * own greeting is dark grey on black, and a guest opening an invitation on
 * a laptop in dark mode seeing a cream column in a black field. Both of
 * those shipped, from a single scaffolded media query that nothing else in
 * the codebase ever honoured.
 *
 * So the invariant is a pair: no `prefers-color-scheme` override, AND no
 * `dark:` styling that would make one meaningful. Adding either alone is
 * the bug; adding both, deliberately, is a real dark theme and whoever
 * does that will delete this test.
 */
describe("colour scheme", () => {
  it("declares the app light-only rather than flipping tokens nothing else honours", () => {
    expect(GLOBALS_CSS).toContain("color-scheme: light");
    expect(GLOBALS_CSS).not.toContain("prefers-color-scheme: dark");
  });

  it("has no dark: variants anywhere, which is what makes light-only honest", () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes("__tests__"),
    );
    // Sanity guard on the walk itself: a glob that silently matched
    // nothing would make this test pass for the wrong reason forever.
    expect(files.length).toBeGreaterThan(50);

    const withDarkVariant = files.filter((file) =>
      // `dark:` as a Tailwind variant always sits inside a class string,
      // right after a quote, a space, or another variant's colon.
      /(^|["'`\s:])dark:/.test(readFileSync(`${SRC_DIR}/${file}`, "utf8")),
    );

    expect(withDarkVariant).toEqual([]);
  });
});
