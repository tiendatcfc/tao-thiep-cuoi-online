import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FONT_OPTIONS, findFontOption } from "./fonts";

/**
 * Two names for what is visually one typeface, because satori keys its font
 * store by `name` and `get()` returns exactly ONE file per name/weight/style
 * — registering both subsets under the same name silently drops the second
 * one (proven by `og-font.subsets.test.ts`, which renders both ways and
 * compares the bytes). Registered under distinct names they both enter the
 * fallback chain, and satori's per-character lookup picks whichever one
 * actually has a glyph. `OG_HEADING_FONT_STACK` is the order that lookup
 * walks, so latin must come first: it holds the shared punctuation and the
 * ampersand between the two names.
 */
export const OG_HEADING_FONT_NAME = "HPWD OG Heading";
export const OG_HEADING_VIETNAMESE_FONT_NAME = "HPWD OG Heading VN";
export const OG_HEADING_FONT_STACK = `${OG_HEADING_FONT_NAME}, ${OG_HEADING_VIETNAMESE_FONT_NAME}`;

/** The weight `sync-fonts.mjs` copies in WOFF1, and the one the card's names are set in. */
const OG_WEIGHT = 700;

/** Used whenever the document's `theme.headingFont` isn't one of the presets (legacy rows, a custom font name). */
const FALLBACK_OPTION = FONT_OPTIONS[0];

/**
 * satori (bundled inside `@vercel/og`, which `next/og`'s `ImageResponse`
 * wraps) parses OpenType/TrueType/Type1/WOFF1 signatures only — confirmed by
 * reading its compiled font parser directly: it switches on the first 4
 * bytes for `\x00\x01\x00\x00`/`"true"`/`"typ1"` (TrueType), `"OTTO"` (CFF/
 * OpenType), or `"wOFF"` (WOFF1), and throws `Unsupported OpenType
 * signature` for anything else — including WOFF2 (`"wOF2"`), which it has
 * no handling for at all. That is why `public/fonts/` carries a WOFF1 copy
 * of each heading face beside the WOFF2 the browser uses.
 *
 * Checking the magic bytes (rather than trusting the file extension)
 * matters because satori's parse failure for a bad signature happens
 * *inside* the async stream `ImageResponse` defers all rendering into —
 * nothing in `opengraph-image.tsx` can catch it there (see that file's own
 * comment on why a `try/catch` around `new ImageResponse(...)` doesn't work
 * for render-time failures). A `sync-fonts.mjs` change that copied the
 * WOFF2 under the `.woff` name would otherwise break every OG image render
 * instead of falling back to the default font.
 */
function isSatoriCompatibleFont(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  const magic = buf.toString("latin1", 0, 4);
  return magic === "\x00\x01\x00\x00" || magic === "true" || magic === "typ1" || magic === "OTTO" || magic === "wOFF";
}

export interface OgFontDescriptor {
  name: string;
  data: Buffer;
  weight: 700;
  style: "normal";
}

export interface OgHeadingFont {
  /** Pass verbatim as the card's CSS `fontFamily`. */
  fontFamily: string;
  /** Pass verbatim as `ImageResponse`'s `fonts` option. */
  fonts: OgFontDescriptor[];
}

async function readFontFile(stem: string, subset: string): Promise<Buffer | null> {
  const filename = `${stem}-${subset}-${OG_WEIGHT}.woff`;
  let buf: Buffer;
  try {
    buf = await readFile(join(process.cwd(), "public", "fonts", filename));
  } catch {
    return null;
  }
  if (isSatoriCompatibleFont(buf)) return buf;
  console.warn(
    `opengraph-image: public/fonts/${filename} is not a TTF/OTF/WOFF1 file satori can parse (a WOFF2 copied ` +
      "under the WOFF1 name?) — rendering without a custom font until `pnpm --filter @hpwd/web sync:fonts` is re-run.",
  );
  return null;
}

/**
 * Loads the self-hosted heading face for the share-preview card, in the
 * couple's own chosen family so the image matches the invitation it links
 * to. Returns `null` — never throws — when the files are missing or
 * unparseable, and the caller then renders with satori's bundled default
 * exactly as before.
 *
 * Both subsets are required rather than optional-each: they are generated
 * as a pair by one script and pinned by `font-files.test.ts`, so half a
 * pair means the checkout is broken, and a latin-only load would quietly
 * reintroduce the very thing this exists to remove — satori fetching the
 * missing diacritics from Google at render time.
 */
export async function loadOgHeadingFont(family: string): Promise<OgHeadingFont | null> {
  const option = findFontOption(family) ?? FALLBACK_OPTION;
  const [latin, vietnamese] = await Promise.all([
    readFontFile(option.file, "latin"),
    readFontFile(option.file, "vietnamese"),
  ]);
  if (!latin || !vietnamese) return null;

  return {
    fontFamily: OG_HEADING_FONT_STACK,
    fonts: [
      { name: OG_HEADING_FONT_NAME, data: latin, weight: OG_WEIGHT, style: "normal" },
      { name: OG_HEADING_VIETNAMESE_FONT_NAME, data: vietnamese, weight: OG_WEIGHT, style: "normal" },
    ],
  };
}
