import * as fontkit from "fontkit";
import { compress } from "wawoff2";
import { VIETNAMESE_GLYPH_SAMPLE, sanitizeFontFamily, type FontExtension } from "./font";

/**
 * Server-only half of the custom-font upload: parsing an uploaded binary
 * and converting it to WOFF2.
 *
 * Split from `font.ts` so the client bundle keeps neither `fontkit` nor
 * `wawoff2` (a WASM build of Google's WOFF2 encoder) — the same reason
 * `rich-text-styles.ts` is separate from `rich-text.ts`.
 */

/** Anything that makes an upload unusable as a web font. The message is shown to the couple, so it is in Vietnamese. */
export class FontParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FontParseError";
  }
}

export interface DescribedFont {
  /** Already run through `sanitizeFontFamily` — safe to interpolate into CSS. */
  family: string;
  /** The characters of `VIETNAMESE_GLYPH_SAMPLE` this font has no glyph for; `""` when it covers them all. */
  missingGlyphs: string;
}

export interface ConvertedFont extends DescribedFont {
  woff2: Buffer;
}

/** The subset of a `fontkit` result this module reads. */
interface FontLike {
  familyName?: string;
  fullName?: string;
  postscriptName?: string;
  hasGlyphForCodePoint(codePoint: number): boolean;
}

/**
 * Pulls the family name and the Vietnamese coverage out of whatever
 * `fontkit.create` returned.
 *
 * Exported separately from `parseAndConvertFont` so its refusals can be
 * tested without hunting down a binary that produces each one — a `.ttc`
 * collection, or a font whose internal name is nothing but punctuation.
 */
export function describeParsedFont(parsed: unknown): DescribedFont {
  // A `.ttc` collection parses into an object with a `fonts` array and no
  // `familyName`. One `@font-face` rule names exactly one family, so
  // there is no sensible way to accept a file containing several.
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { fonts?: unknown }).fonts)) {
    throw new FontParseError(
      "File này là bộ nhiều font (.ttc). Hãy tách ra và tải lên từng font một.",
    );
  }

  const font = parsed as FontLike;
  const family =
    sanitizeFontFamily(font.familyName) ??
    sanitizeFontFamily(font.fullName) ??
    sanitizeFontFamily(font.postscriptName);

  if (!family) {
    throw new FontParseError("Không đọc được tên font trong file. Hãy thử một file font khác.");
  }

  const missingGlyphs = [...VIETNAMESE_GLYPH_SAMPLE]
    .filter((character) => !font.hasGlyphForCodePoint(character.codePointAt(0) as number))
    .join("");

  return { family, missingGlyphs };
}

/**
 * Validates an uploaded font and returns it as WOFF2.
 *
 * `fontkit.create` throwing IS the "is this actually a font" check — the
 * declared content type and the filename extension are only a cheap
 * pre-filter, exactly as `processImage` relates to an uploaded image's
 * declared type.
 *
 * Missing Vietnamese glyphs are REPORTED, not rejected: a couple may
 * deliberately pick a decorative Latin font for a monogram or an English
 * line, and refusing it outright would be the tool overruling them. The
 * caller surfaces the warning.
 */
export async function parseAndConvertFont(buffer: Buffer, extension: FontExtension): Promise<ConvertedFont> {
  let parsed: unknown;
  try {
    parsed = fontkit.create(buffer);
  } catch (error) {
    throw new FontParseError("Không đọc được file font. File có thể hỏng hoặc không phải font.", {
      cause: error,
    });
  }

  const described = describeParsedFont(parsed);

  // `wawoff2.compress` only reads sfnt input; handed a WOFF2 it throws
  // "ConvertTTFToWOFF2 failed". An upload that is already WOFF2 needs no
  // conversion anyway — it is exactly what gets stored.
  if (extension === ".woff2") {
    return { ...described, woff2: buffer };
  }

  try {
    return { ...described, woff2: Buffer.from(await compress(buffer)) };
  } catch (error) {
    throw new FontParseError("Không chuyển được font sang định dạng WOFF2. Hãy thử file khác.", {
      cause: error,
    });
  }
}
