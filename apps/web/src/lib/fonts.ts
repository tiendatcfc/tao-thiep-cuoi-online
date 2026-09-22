/**
 * Self-hosted font-pair registry for `ThemePanel`'s font picker.
 *
 * Deliberately NOT `next/font/google` and not a runtime fetch from
 * fonts.gstatic.com: this dev machine's corporate TLS proxy MITMs that
 * host, so any build-time or runtime Google Fonts request fails here. Every
 * family below is self-hosted instead: `scripts/sync-fonts.mjs` copies the
 * files out of the `@fontsource/*` packages (npm, which the proxy passes
 * through) into `public/fonts/`, in WOFF2 for the browser and WOFF1 for the
 * OG image renderer, and writes `src/app/fonts.generated.css`. See
 * `public/fonts/README.md`.
 *
 * `family` is the exact string persisted in `theme.headingFont`/
 * `theme.bodyFont` (`ThemeSchema` just has these as plain strings, no
 * enum) — it doubles as both the picker's option value/label and the
 * `@font-face` family name.
 */

export type FontCategory = "serif" | "sans" | "script";

export interface FontOption {
  id: string;
  /** Display name; also the value stored in `theme.headingFont`/`theme.bodyFont`. */
  family: string;
  /** CSS `font-family` name the `@font-face` rule in `fonts.css` declares. Always equal to `family` here, kept separate in case a self-hosted file ever needs to alias to a different CSS name. */
  cssFamily: string;
  /** Comma-separated fallback stack (no trailing font — `fontFamilyStack` prepends the quoted `cssFamily`), used whenever the .woff2 file is missing/still loading, so the preview never has literally no font. */
  fallback: string;
  category: FontCategory;
  /** Base filename (no extension/weight suffix) under `public/fonts/` — the README lists e.g. `<file>-400.woff2` and `<file>-700.woff2`. */
  file: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "playfair-display",
    family: "Playfair Display",
    cssFamily: "Playfair Display",
    fallback: "Georgia, 'Times New Roman', serif",
    category: "serif",
    file: "playfair-display",
  },
  {
    id: "cormorant-garamond",
    family: "Cormorant Garamond",
    cssFamily: "Cormorant Garamond",
    fallback: "Georgia, 'Times New Roman', serif",
    category: "serif",
    file: "cormorant-garamond",
  },
  {
    id: "lora",
    family: "Lora",
    cssFamily: "Lora",
    fallback: "Georgia, serif",
    category: "serif",
    file: "lora",
  },
  {
    id: "be-vietnam-pro",
    family: "Be Vietnam Pro",
    cssFamily: "Be Vietnam Pro",
    fallback: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    category: "sans",
    file: "be-vietnam-pro",
  },
  {
    id: "quicksand",
    family: "Quicksand",
    cssFamily: "Quicksand",
    fallback: "'Segoe UI', Roboto, sans-serif",
    category: "sans",
    file: "quicksand",
  },
  {
    id: "dancing-script",
    family: "Dancing Script",
    cssFamily: "Dancing Script",
    fallback: "'Brush Script MT', cursive",
    category: "script",
    file: "dancing-script",
  },
  {
    id: "merriweather",
    family: "Merriweather",
    cssFamily: "Merriweather",
    fallback: "Georgia, serif",
    category: "serif",
    file: "merriweather",
  },
  {
    id: "inter",
    family: "Inter",
    cssFamily: "Inter",
    fallback: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    category: "sans",
    file: "inter",
  },
];

export function findFontOption(family: string): FontOption | undefined {
  return FONT_OPTIONS.find((option) => option.family === family);
}

/**
 * Builds the CSS `font-family` value for `--font-heading`/`--font-body`:
 * the self-hosted family (quoted) followed by its fallback stack, so text
 * still renders in something sensible while the woff2 is in flight or if it
 * ever 404s, rather than in nothing. An unrecognized family
 * name (e.g. legacy data) still produces a usable stack instead of
 * throwing or returning "".
 */
export function fontFamilyStack(family: string): string {
  const option = findFontOption(family);
  if (option) return `"${option.cssFamily}", ${option.fallback}`;
  return family ? `"${family}", sans-serif` : "sans-serif";
}
