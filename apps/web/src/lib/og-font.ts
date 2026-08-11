import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_HEADING_FONT_NAME = "HPWD OG Heading";

// `.ttf` checked first (what the README asks for); `.woff` (WOFF1, also
// satori-parseable) as a second option in case a WOFF1 copy is dropped in
// instead of/alongside the TTF.
const CANDIDATE_FILENAMES = ["og-heading.ttf", "og-heading.woff"] as const;

/**
 * satori (bundled inside `@vercel/og`, which `next/og`'s `ImageResponse`
 * wraps) parses OpenType/TrueType/Type1/WOFF1 signatures only — confirmed by
 * reading its compiled font parser directly: it switches on the first 4
 * bytes for `\x00\x01\x00\x00`/`"true"`/`"typ1"` (TrueType), `"OTTO"` (CFF/
 * OpenType), or `"wOFF"` (WOFF1), and throws `Unsupported OpenType
 * signature` for anything else — including WOFF2 (`"wOF2"`), which it has
 * no handling for at all. The site's own `@font-face` rules in `fonts.css`
 * use WOFF2 exclusively (smallest download for real browsers), so those
 * files are useless here; see `public/fonts/README.md`'s "For the OG image
 * renderer" section for the separate TTF/WOFF1 file this expects.
 *
 * Checking the magic bytes (rather than trusting the `.ttf`/`.woff` file
 * extension) matters because satori's parse failure for a bad signature
 * happens *inside* the async stream `ImageResponse` defers all rendering
 * into — nothing in `opengraph-image.tsx` can catch it there (see that
 * file's own comment on why a `try/catch` around `new ImageResponse(...)`
 * doesn't work for render-time failures). A human accidentally saving the
 * WOFF2 file under the `.ttf` name would otherwise silently break every OG
 * image render instead of just falling back to the default font.
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

/**
 * Best-effort load of a self-hosted heading-font file for the OG image
 * renderer. Returns `null` — never throws — when no candidate file exists
 * yet, or one exists but isn't a format satori can parse; either way the
 * caller renders with satori's bundled default font instead, exactly like
 * before this file existed.
 */
export async function loadOgHeadingFont(): Promise<OgFontDescriptor | null> {
  for (const filename of CANDIDATE_FILENAMES) {
    let buf: Buffer;
    try {
      buf = await readFile(join(process.cwd(), "public", "fonts", filename));
    } catch {
      continue; // Doesn't exist (or unreadable) — try the next candidate.
    }
    if (isSatoriCompatibleFont(buf)) {
      return { name: OG_HEADING_FONT_NAME, data: buf, weight: 700, style: "normal" };
    }
    console.warn(
      `opengraph-image: public/fonts/${filename} exists but doesn't look like a TTF/OTF/WOFF1 file satori ` +
        "can parse (WOFF2 instead of WOFF1/TTF?) — rendering without a custom font until this is fixed.",
    );
  }
  return null;
}
