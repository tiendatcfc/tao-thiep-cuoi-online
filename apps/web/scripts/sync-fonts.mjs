/**
 * Copies the invitation typefaces out of the installed `@fontsource/*`
 * packages into `public/fonts/`, and regenerates the `@font-face` block
 * (`src/app/fonts.generated.css`) that points at them.
 *
 * Why this exists at all: `public/fonts/README.md` used to say these files
 * could only be fetched from a machine without a corporate TLS proxy,
 * because `next/font/google` and every direct download talk to
 * `fonts.gstatic.com`, which that proxy MITMs. That blocker was about the
 * TRANSPORT, not the files — `@fontsource/*` ships the byte-identical
 * Google Fonts WOFF2 subsets through the npm registry, which the proxy
 * passes through normally. So the fonts come in over npm and are committed
 * like any other asset; nothing here ever contacts Google, at build time or
 * at runtime, exactly as before.
 *
 * Run with `pnpm --filter @hpwd/web sync:fonts`. Its output is committed,
 * so a normal install/build never needs to run it — it is re-run only when
 * `FONT_OPTIONS` gains a family or a `@fontsource` package is upgraded.
 * `font-files.test.ts` fails if the committed output and this manifest
 * ever drift apart.
 */
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, "..");

/**
 * Only the two subsets a Vietnamese wedding invitation can actually render
 * with: `latin` (ASCII, punctuation, the currency and quote marks) and
 * `vietnamese` (the tone marks and Đ/Ơ/Ư that every other subset omits).
 * Deliberately NOT `latin-ext`/`cyrillic`, which these packages also ship —
 * a guest would download them for glyphs no Vietnamese name contains.
 *
 * Both are required, and both need their `unicode-range`: two `@font-face`
 * rules with the same family/weight/style and no range are not additive,
 * the last one simply wins, which would leave the invitation with the
 * Vietnamese diacritics and no letters to put them on.
 */
const SUBSETS = ["latin", "vietnamese"];

/** 400 and 700 only. `font-semibold` (600) resolves up to 700 by the CSS font-matching rules, so the headings still get a real bold rather than a synthesised one. */
const WEIGHTS = [400, 700];

/**
 * The share-preview image (`app/i/[slug]/opengraph-image.tsx`) is rendered
 * by satori, not a browser, and satori cannot parse WOFF2 at all — it
 * switches on the file signature and only knows TrueType/OpenType/Type1 and
 * WOFF1. So the same typefaces are ALSO copied in WOFF1, which
 * `@fontsource` ships beside the WOFF2, at the single weight that card
 * uses.
 *
 * This is not cosmetic. Left without a font it can read, satori falls back
 * to its own bundled Noto Sans — which is the `latin` subset and has no
 * Vietnamese diacritics — and then reaches out to
 * `fonts.googleapis.com/css2?...&text=<the missing characters>` at render
 * time to fetch glyphs for them. That put the couple's own name characters
 * in a query string to Google on every share render, in an app whose whole
 * point is that it makes no third-party request; and when that fetch fails
 * (any host with restricted egress, or this machine's TLS proxy) the names
 * render as empty boxes. Shipping these 16 files removes both.
 */
const OG_WEIGHT = 700;

/**
 * `pkg` is the npm package, `file` is the filename stem under
 * `public/fonts/` and MUST equal the matching `FONT_OPTIONS[].file` in
 * `src/lib/fonts.ts`; `family` MUST equal its `cssFamily`. A test pins all
 * three together rather than trusting this comment.
 */
export const FONT_PACKAGES = [
  { pkg: "@fontsource/playfair-display", family: "Playfair Display", file: "playfair-display" },
  { pkg: "@fontsource/cormorant-garamond", family: "Cormorant Garamond", file: "cormorant-garamond" },
  { pkg: "@fontsource/lora", family: "Lora", file: "lora" },
  { pkg: "@fontsource/be-vietnam-pro", family: "Be Vietnam Pro", file: "be-vietnam-pro" },
  { pkg: "@fontsource/quicksand", family: "Quicksand", file: "quicksand" },
  { pkg: "@fontsource/dancing-script", family: "Dancing Script", file: "dancing-script" },
  { pkg: "@fontsource/merriweather", family: "Merriweather", file: "merriweather" },
  { pkg: "@fontsource/inter", family: "Inter", file: "inter" },
];

/** Every `<stem>-<subset>-<weight>.woff2` the manifest above implies — the single source of truth for both the copy step and the test. */
export function expectedFontFiles() {
  const names = [];
  for (const entry of FONT_PACKAGES) {
    for (const subset of SUBSETS) {
      for (const weight of WEIGHTS) {
        names.push(`${entry.file}-${subset}-${weight}.woff2`);
      }
    }
  }
  return names;
}

/**
 * Every `<stem>-<subset>-700.woff` the manifest implies — the WOFF1 pair
 * per family that `lib/og-font.ts` hands to satori. Kept separate from
 * `expectedFontFiles()` because these are never referenced by
 * `fonts.generated.css`: no browser ever downloads them, they are read off
 * disk by the OG route on the server.
 */
export function expectedOgFontFiles() {
  const names = [];
  for (const entry of FONT_PACKAGES) {
    for (const subset of SUBSETS) {
      names.push(`${entry.file}-${subset}-${OG_WEIGHT}.woff`);
    }
  }
  return names;
}

function packageDir(pkg) {
  return dirname(require.resolve(`${pkg}/package.json`));
}

/**
 * The `unicode-range` each subset covers, read from the package's own
 * `unicode.json` rather than hardcoded here: Google revises these ranges
 * (the `latin` subset picked up `U+0329` at one point), and a stale
 * hardcoded copy would silently stop matching characters the file actually
 * contains.
 */
function unicodeRanges(pkg) {
  return JSON.parse(readFileSync(join(packageDir(pkg), "unicode.json"), "utf8"));
}

function fontFaceRule({ family, file }, subset, weight, range) {
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  src: url("/fonts/${file}-${subset}-${weight}.woff2") format("woff2");`,
    `  font-weight: ${weight};`,
    "  font-style: normal;",
    "  font-display: swap;",
    `  unicode-range: ${range};`,
    "}",
  ].join("\n");
}

export function generateCss() {
  const blocks = [];
  for (const entry of FONT_PACKAGES) {
    const ranges = unicodeRanges(entry.pkg);
    const rules = [];
    for (const subset of SUBSETS) {
      const range = ranges[subset];
      if (!range) throw new Error(`${entry.pkg} has no "${subset}" subset in unicode.json`);
      for (const weight of WEIGHTS) {
        rules.push(fontFaceRule(entry, subset, weight, range));
      }
    }
    blocks.push(`/* ${entry.family} */\n${rules.join("\n")}`);
  }

  return [
    "/*",
    " * GENERATED by scripts/sync-fonts.mjs — do not edit by hand.",
    " * Run `pnpm --filter @hpwd/web sync:fonts` to regenerate.",
    " *",
    " * Every `src` below is a same-origin file under public/fonts/, copied",
    " * out of the matching @fontsource package. No request ever goes to",
    " * fonts.gstatic.com or any other external host, at build time or at",
    " * runtime — see the script's header for why that constraint exists.",
    " */",
    "",
    blocks.join("\n\n"),
    "",
  ].join("\n");
}

function main() {
  const outDir = join(WEB_ROOT, "public", "fonts");
  mkdirSync(outDir, { recursive: true });

  let copied = 0;
  for (const entry of FONT_PACKAGES) {
    const filesDir = join(packageDir(entry.pkg), "files");
    const stem = entry.pkg.slice("@fontsource/".length);
    for (const subset of SUBSETS) {
      for (const weight of WEIGHTS) {
        const from = join(filesDir, `${stem}-${subset}-${weight}-normal.woff2`);
        const to = join(outDir, `${entry.file}-${subset}-${weight}.woff2`);
        copyFileSync(from, to);
        copied += 1;
      }
    }
  }

  let copiedOg = 0;
  for (const entry of FONT_PACKAGES) {
    const filesDir = join(packageDir(entry.pkg), "files");
    const stem = entry.pkg.slice("@fontsource/".length);
    for (const subset of SUBSETS) {
      const from = join(filesDir, `${stem}-${subset}-${OG_WEIGHT}-normal.woff`);
      const to = join(outDir, `${entry.file}-${subset}-${OG_WEIGHT}.woff`);
      copyFileSync(from, to);
      copiedOg += 1;
    }
  }

  const cssPath = join(WEB_ROOT, "src", "app", "fonts.generated.css");
  writeFileSync(cssPath, generateCss(), "utf8");

  console.log(`sync-fonts: copied ${copied} woff2 files into public/fonts/`);
  console.log(`sync-fonts: copied ${copiedOg} woff (WOFF1) files for the OG renderer`);
  console.log(`sync-fonts: wrote ${cssPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
