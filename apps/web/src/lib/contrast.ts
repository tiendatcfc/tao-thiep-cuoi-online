/**
 * Picks legible ink for a background colour the couple chose.
 *
 * The invitation's information cards are filled with `theme.primary`, which
 * is a free-form colour field in the editor — a deep maroon for one couple,
 * a pale blush for the next. Cream text is right on the first and invisible
 * on the second, and "hope nobody picks a pale primary" is not a design.
 *
 * So the ink is computed. `InvitePage` runs this once per render (it
 * already holds the theme as plain strings) and publishes the answer as
 * `--on-primary`, which every card then reads. Everything here is pure and
 * synchronous: no canvas, no `getComputedStyle`, nothing that would differ
 * between the server render and the client's.
 *
 * Deliberately NOT a luminance threshold. A single cut-off gets
 * mid-luminance colours wrong in both directions; comparing the actual
 * WCAG contrast ratio of the two candidate inks and taking the better one
 * is the same amount of code and is correct by construction.
 */

/** Warm off-white, matching the paper tones used elsewhere rather than pure #fff, which glares against a saturated fill. */
export const INK_ON_DARK = "#fbf7f2";

/** Same value as `--ink` in globals.css — the warm near-black the rest of the invitation sets text in. */
export const INK_ON_LIGHT = "#1f1b18";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

/**
 * Understands the colour notations the editor's `<input type="color">` and
 * hand-typed theme values actually produce: `#rgb`, `#rrggbb`, `#rrggbbaa`
 * and `rgb()`/`rgba()`. Alpha is parsed and then ignored — a translucent
 * card fill composites against an unknown backdrop, so there is no honest
 * luminance to compute and the caller's fallback is the right answer.
 *
 * Returns `null` for anything else (`oklch()`, `color()`, `rebeccapurple`,
 * a CSS variable, an empty string). Resolving those needs a browser, which
 * would make this asymmetric between the server render and the client's —
 * exactly the class of bug this project has hit repeatedly.
 */
export function parseColor(value: string): Rgb | null {
  const input = value.trim();
  if (!input) return null;

  const rgb = RGB_RE.exec(input);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
    return { r: channels[0], g: channels[1], b: channels[2] };
  }

  const hex = HEX_RE.exec(input);
  if (!hex) return null;
  const digits = hex[1];

  if (digits.length === 3 || digits.length === 4) {
    return {
      r: parseInt(digits[0] + digits[0], 16),
      g: parseInt(digits[1] + digits[1], 16),
      b: parseInt(digits[2] + digits[2], 16),
    };
  }
  if (digits.length === 6 || digits.length === 8) {
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  // 5 or 7 digits: not a hex colour, just a typo that happens to be hex-ish.
  return null;
}

/** WCAG 2.1 relative luminance: sRGB channels linearised, then weighted for human sensitivity to green. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whichever of the two invitation inks reads better on `background`.
 *
 * Unparseable colours fall back to `INK_ON_DARK`, which is what every card
 * used unconditionally before this existed — a colour this cannot read is
 * no worse off than it was, and never worse than the status quo.
 */
export function readableInkOn(background: string): string {
  const rgb = parseColor(background);
  if (!rgb) return INK_ON_DARK;

  const dark = parseColor(INK_ON_DARK)!;
  const light = parseColor(INK_ON_LIGHT)!;
  return contrastRatio(rgb, dark) >= contrastRatio(rgb, light) ? INK_ON_DARK : INK_ON_LIGHT;
}
