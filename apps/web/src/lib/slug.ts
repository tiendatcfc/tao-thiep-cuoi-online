/**
 * Vietnamese diacritics helpers, shared by the VietQR message field
 * (`vietqr.ts`) and by section/page slug generation (Task 17).
 */

// Combining diacritical marks left behind by NFD decomposition (U+0300–U+036F).
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Strips Vietnamese diacritics, e.g. "Đám Cưới" -> "Dam Cuoi". `đ`/`Đ` don't
 * decompose under NFD (they're distinct Latin Extended-A codepoints), so
 * they're mapped explicitly.
 */
export function removeDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Converts a string into a URL-safe slug: diacritics stripped, lowercased,
 * non-alphanumeric runs collapsed into a single hyphen, and leading/trailing
 * hyphens trimmed.
 */
export function toSlug(s: string): string {
  return removeDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
