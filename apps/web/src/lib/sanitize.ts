/**
 * Tiny allowlist HTML sanitizer for owner-authored rich text (the `text`
 * section's `props.html`, edited by the invitation owner in the editor —
 * Task 11/15 — not arbitrary third-party input). This is defense-in-depth,
 * not a hardened sanitizer: it strips the obvious XSS vectors (`<script>`,
 * inline `on*` handlers, `javascript:` hrefs) and rewrites every tag to keep
 * only a small allowlist, dropping any attribute except `href` on `<a>`.
 *
 * Anything not in the allowlist has its tag markers removed but its text
 * content kept, so unexpected markup degrades to plain text instead of
 * disappearing outright.
 */

const ALLOWED_TAGS = new Set(["p", "a", "strong", "em", "br", "u", "span"]);

// Matches an opening or closing HTML tag: `<tag ...attrs>`, `</tag>`, or a
// self-closing `<tag .../>`. The attrs group only requires a match when
// preceded by whitespace, so bare tags like `<p>` and `<br/>` still match.
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)\/?>/g;

/**
 * True unless `href` is (possibly obfuscated with whitespace/control
 * characters, a common filter-bypass trick) a `javascript:` URL.
 */
function isSafeHref(href: string): boolean {
  const normalized = href.replace(/[\s\x00-\x1f]+/g, "").toLowerCase();
  return !normalized.startsWith("javascript:");
}

function extractHref(attrs: string): string | null {
  const match = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

export function sanitizeHtml(html: string): string {
  // Drop <script>...</script> blocks (and their content) before the
  // tag-by-tag pass below, since that pass keeps text content by default —
  // script bodies are the one case where the content itself must go too.
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");

  return withoutScripts.replace(TAG_RE, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    const isClosing = match.startsWith("</");
    if (isClosing) return `</${tag}>`;

    if (tag === "a") {
      const href = extractHref(attrs);
      if (href && isSafeHref(href)) {
        return `<a href="${href.replace(/"/g, "&quot;")}">`;
      }
      return "<a>";
    }

    return `<${tag}>`;
  });
}
