import { sanitizeFontFamily, sanitizeFontSrcUrl } from "@/lib/font";

/**
 * `@font-face` rules for the fonts a couple uploaded themselves
 * (`theme.customFonts`), rendered inside `InvitePage` so the published
 * invitation and the editor's live preview get exactly the same
 * declarations.
 *
 * The built-in families are declared statically in `fonts.css` instead;
 * only these are per-document and therefore have to be emitted inline.
 *
 * Both halves of every rule are re-sanitized here even though the upload
 * route already sanitized them. The document is rewritable in full through
 * `PATCH /api/invitations/[id]`, so by the time values arrive here they are
 * untrusted input again — the same reason `TextSection` runs `sanitizeHtml`
 * a second time at render rather than trusting what the editor stored.
 *
 * A single malformed entry is skipped, never fatal: one bad font must not
 * blank the typography of an invitation that is already published.
 */
export interface CustomFontStyleProps {
  /**
   * Structural, not `Theme["customFonts"]`: this component reads a family
   * and a URL and nothing else, so declaring the whole theme entry would
   * force every caller and every test to supply an `assetId` that is never
   * looked at. A real `Theme["customFonts"]` still satisfies it.
   */
  fonts: readonly { family: string; url: string }[];
}

export function CustomFontStyle({ fonts }: CustomFontStyleProps) {
  const rules = fonts
    .map((font) => {
      const family = sanitizeFontFamily(font.family);
      const url = sanitizeFontSrcUrl(font.url);
      if (!family || !url) return null;
      return `@font-face { font-family: "${family}"; src: url("${url}") format("woff2"); font-display: swap; }`;
    })
    .filter((rule): rule is string => rule !== null);

  if (rules.length === 0) return null;

  return (
    // `dangerouslySetInnerHTML` rather than a text child: React escapes text
    // children, so a font URL carrying `&` (a signed or versioned link)
    // would reach the browser as `&amp;` and 404. Safe here because both
    // interpolated parts come from character allowlists above — nothing
    // that could close the string, the declaration or the rule survives
    // them.
    <style dangerouslySetInnerHTML={{ __html: rules.join("\n") }} />
  );
}
