import { isSafeHref } from "./sanitize";

/**
 * Constants and pure helpers for the custom-font upload (spec feature 16).
 *
 * Deliberately dependency-free: `FontUploadField` and `ThemePanel` are
 * client components and import the limits from here, so pulling `fontkit`
 * or `wawoff2` into this module would ship a font parser and a WASM WOFF2
 * encoder to every visitor's browser. The parsing half lives in
 * `font-server.ts`, which only ever runs in a route handler.
 */

/** Spec feature 16: "Upload TTF/OTF/WOFF2 ≤ 5MB". */
export const MAX_FONT_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * WOFF1 (`.woff`) is deliberately absent: `wawoff2` can neither read nor
 * write it, every browser this project targets supports WOFF2, and a
 * format that cannot be converted would have to be stored as uploaded —
 * a second code path for no benefit.
 */
export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff2"] as const;
export type FontExtension = (typeof FONT_EXTENSIONS)[number];

export const FONT_ACCEPT_ATTRIBUTE = FONT_EXTENSIONS.join(",");

/**
 * The glyphs checked before accepting a font, from the spec: the seven
 * Vietnamese-specific vowels plus one tone mark per diacritic shape on
 * `Ă`. A Latin font subset for English carries `â` and `ê` but almost
 * never `ư` or `Ẵ`, so a sample of only the common ones would pass fonts
 * that render a couple's own names as boxes.
 */
export const VIETNAMESE_GLYPH_SAMPLE = "ăâđêôơưẮẰẲẴẶ";

/** Long enough for real names ("Cormorant Garamond SemiBold"), short enough that the rendered `@font-face` stays small. */
export const MAX_FONT_FAMILY_LENGTH = 64;

/**
 * The extension a filename actually ends in, or `null`.
 *
 * A cheap pre-filter for the browser and for early rejection — `fontkit`
 * failing to parse the bytes is the real "is this a font" check, the same
 * division of labour `processImage` has with an uploaded image's declared
 * content type. Matching on the extension rather than on `file.type`
 * because browsers disagree wildly about font MIME types: the same .ttf
 * arrives as `font/ttf`, `application/x-font-ttf`, `application/octet-stream`
 * or an empty string depending on the OS and the browser.
 */
export function fontExtensionOf(filename: string): FontExtension | null {
  const lowered = filename.toLowerCase();
  return FONT_EXTENSIONS.find((ext) => lowered.endsWith(ext)) ?? null;
}

/** Storage key for a stored font. Always `.woff2` — every upload is converted. */
export function fontObjectKey(userId: string, assetId: string): string {
  return `u/${userId}/${assetId}.woff2`;
}

/**
 * Everything except letters, marks, digits, spaces and hyphens. An
 * ALLOWLIST, expressed as its complement so a single `replace` does the
 * work: `"`, `\`, `{`, `}`, `;`, `<`, `@` and every control character fall
 * outside it without having to be enumerated, and no future CSS syntax can
 * sneak in by being something nobody thought to deny.
 */
const DISALLOWED_IN_FAMILY = /[^\p{L}\p{M}\p{N} -]/gu;

/**
 * Makes a font's internal family name safe to interpolate into CSS, or
 * returns `null` if nothing usable is left.
 *
 * This is the security boundary of the whole feature. The name is read out
 * of a binary an untrusted user uploaded and then written into
 * `@font-face { font-family: "…" }` on a published wedding invitation; a
 * name containing a quote and a brace closes the rule and can restyle or
 * blank the entire page, served from the couple's own domain.
 *
 * Unicode letters and marks are kept, so a Vietnamese font can legitimately
 * be named in Vietnamese — safe because the characters that give CSS its
 * structure are excluded by the allowlist regardless of script.
 */
export function sanitizeFontFamily(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(DISALLOWED_IN_FAMILY, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_FONT_FAMILY_LENGTH).trim();
}

/**
 * Characters that would end the `url("…")` token, or the declaration, or
 * the whole rule. A legitimate font URL contains none of them — a URL that
 * genuinely needs one carries it percent-encoded.
 */
const UNSAFE_IN_CSS_URL = /["'\\()\s;{}<>]/;

/**
 * Makes a stored font URL safe to interpolate into `@font-face { src:
 * url("…") }`, or returns `null`.
 *
 * `theme.customFonts` is part of the invitation document, and the document
 * is writable through `PATCH /api/invitations/[id]` — so by the time it
 * reaches a renderer, a URL here is untrusted input again even though the
 * upload route wrote a safe one. Re-checking at render is the same
 * defence-in-depth `TextSection` applies by sanitizing HTML a second time.
 *
 * `isSafeHref` supplies the scheme allowlist rather than a second copy of
 * it, so the rich-text anchors and this can never drift apart; `data:` is
 * excluded by that allowlist, which also keeps a whole font from being
 * inlined into the document and bypassing the upload pipeline.
 */
export function sanitizeFontSrcUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || UNSAFE_IN_CSS_URL.test(trimmed)) return null;
  return isSafeHref(trimmed) ? trimmed : null;
}
