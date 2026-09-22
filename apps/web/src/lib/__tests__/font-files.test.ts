import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FONT_OPTIONS } from "../fonts";
// The build script is plain `.mjs` on purpose — it runs under bare `node`
// with no compile step — and TypeScript infers its exports from the source.
import { FONT_PACKAGES, expectedFontFiles, expectedOgFontFiles, generateCss } from "../../../scripts/sync-fonts.mjs";

const WEB_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The invitation typefaces are committed binaries produced by
 * `scripts/sync-fonts.mjs` from the `@fontsource/*` packages. Nothing at
 * build time regenerates or verifies them, so the failure mode is silent
 * by construction: a missing or renamed file makes the browser 404 the
 * `@font-face` `src` and fall back to Georgia/system-sans, and the page
 * still renders perfectly — just in the wrong typeface. That is exactly
 * what shipped for months, and it is the single biggest reason the
 * invitation looked dated.
 *
 * These tests are the tripwire for that. They deliberately check the real
 * bytes on disk, not a manifest describing them.
 */
describe("invitation font files", () => {
  it("has a @fontsource package for every family the editor offers, under the same name", () => {
    // `file` is what `fonts.generated.css` builds its URLs from and
    // `cssFamily` is the name `fontFamilyStack` quotes — a mismatch in
    // either one is a 404 or a font that never matches, both invisible at
    // runtime.
    const fromRegistry = FONT_OPTIONS.map((option) => `${option.cssFamily}|${option.file}`).sort();
    const fromScript = (FONT_PACKAGES as { family: string; file: string }[])
      .map((entry) => `${entry.family}|${entry.file}`)
      .sort();

    expect(fromScript).toEqual(fromRegistry);
  });

  it("ships every expected .woff2, and each one really is a woff2", () => {
    const missing: string[] = [];
    const notWoff2: string[] = [];

    for (const name of expectedFontFiles() as string[]) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(`${WEB_ROOT}/public/fonts/${name}`);
      } catch {
        missing.push(name);
        continue;
      }
      // The WOFF2 signature. Checking the magic number rather than the
      // extension is what catches the mistake `public/fonts/README.md`
      // warns about for the OG font: a file of the wrong format saved
      // under the right name degrades silently instead of erroring.
      if (bytes.subarray(0, 4).toString("latin1") !== "wOF2") notWoff2.push(name);
    }

    expect({ missing, notWoff2 }).toEqual({ missing: [], notWoff2: [] });
  });

  it("references exactly the shipped files from the generated stylesheet, and nothing else", () => {
    const css = readFileSync(`${WEB_ROOT}/src/app/fonts.generated.css`, "utf8");
    const referenced = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((match) => match[1]);

    expect([...new Set(referenced)].sort()).toEqual((expectedFontFiles() as string[]).slice().sort());
  });

  it("carries a Vietnamese unicode-range for every family, so diacritics are not left to the fallback font", () => {
    const css = readFileSync(`${WEB_ROOT}/src/app/fonts.generated.css`, "utf8");

    for (const name of (expectedFontFiles() as string[]).filter((file) => file.includes("-vietnamese-"))) {
      const rule = css.slice(css.indexOf(`url("/fonts/${name}")`));
      const range = rule.slice(0, rule.indexOf("}"));
      // U+1EA0–1EF9 is the Latin Extended Additional block that holds ạ ả
      // ấ ầ ậ ắ ề ế ệ ọ ộ ơ ớ ợ ụ ủ ứ ự ỳ ỹ — i.e. most of a Vietnamese
      // wedding invitation. Without the range these rules would not be
      // additive with the latin ones at all: same family, same weight, no
      // range means the last declaration simply wins.
      expect(range, name).toContain("U+1EA0-1EF9");
    }
  });

  /*
   * The WOFF1 half of the same manifest, for the share-preview image.
   * satori cannot parse WOFF2 at all, and with no font it can read it
   * falls back to a latin-only face and then fetches the missing
   * Vietnamese glyphs from fonts.googleapis.com at render time — putting
   * the couple's own name characters in a query string to Google. These
   * files are what stops that, so a missing one is not cosmetic.
   */
  it("ships the WOFF1 pair the OG renderer needs, and each one really is a WOFF1", () => {
    const missing: string[] = [];
    const notWoff1: string[] = [];

    for (const name of expectedOgFontFiles() as string[]) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(`${WEB_ROOT}/public/fonts/${name}`);
      } catch {
        missing.push(name);
        continue;
      }
      // "wOFF", not "wOF2". Copying the WOFF2 under the WOFF1 name is the
      // one mistake that would break every OG render at once, from inside
      // the stream `ImageResponse` renders in, where nothing can catch it.
      if (bytes.subarray(0, 4).toString("latin1") !== "wOFF") notWoff1.push(name);
    }

    expect({ missing, notWoff1 }).toEqual({ missing: [], notWoff1: [] });
  });

  it("gives every family the picker offers both OG subsets, so switching font never loses diacritics", () => {
    const shipped = new Set(expectedOgFontFiles() as string[]);

    for (const option of FONT_OPTIONS) {
      expect(shipped, option.family).toContain(`${option.file}-latin-700.woff`);
      expect(shipped, option.family).toContain(`${option.file}-vietnamese-700.woff`);
    }
  });

  it("never references the OG WOFF1 files from the stylesheet — no browser should download them", () => {
    // They are read off disk by the server, and are ~390 kB in total.
    // A stray `@font-face` pointing at them would hand every guest a
    // second copy of a font their browser already has in WOFF2.
    const css = readFileSync(`${WEB_ROOT}/src/app/fonts.generated.css`, "utf8");

    expect(css).not.toContain('.woff"');
  });

  it("keeps the committed stylesheet identical to what the script generates now", () => {
    // Guards both directions: a hand edit to the generated file, and a
    // `@fontsource` upgrade that changes a unicode-range without anyone
    // re-running `pnpm --filter @hpwd/web sync:fonts`.
    const committed = readFileSync(`${WEB_ROOT}/src/app/fonts.generated.css`, "utf8");
    expect(generateCss()).toBe(committed);
  });
});
