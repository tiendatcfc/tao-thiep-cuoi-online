/**
 * Escape-first, selectively-unescape HTML sanitizer for owner-authored rich
 * text (the `text` section's `props.html`).
 *
 * An earlier version of this file tried to detect and strip dangerous
 * markup with tag-matching regexes. That's a losing game: a security review
 * found two reproducible bypasses —
 *
 *   1. Nested-tag reconstruction: `<a href="jav<b>ascript:alert(1)">` — a
 *      tag-matching regex can't match the outer `<a>` (its attrs stop at
 *      the first `<`), so the inner `<b>` gets stripped on its own and
 *      `String.replace` concatenation reassembles a live `javascript:` href.
 *   2. Entity-encoded scheme: `href="&#106;avascript:alert(1)"` — a denylist
 *      check on the raw string never sees "javascript:"; the browser decodes
 *      the entity at parse time, after our check already passed it.
 *
 * Both bypasses exploit the same root cause: trying to recognize "bad"
 * patterns in a format (HTML) with too many equivalent encodings to
 * enumerate. This version inverts the approach instead of patching the
 * regexes:
 *
 *   1. Escape the ENTIRE input (`&` first, then `< > "`) so none of it can
 *      be interpreted as markup.
 *   2. Selectively unescape ONLY a small set of *exact* allowlisted
 *      patterns back into real tags.
 *
 * Anything that isn't an exact match for an allowlisted pattern simply
 * stays escaped and renders as inert text — there is no denylist, and
 * nothing here tries to parse or repair attacker-supplied markup.
 */

// `&` is only escaped when it ISN'T already the start of one of the four
// entities this function itself produces. Without that guard, re-running
// sanitizeHtml on its own output would double-escape any leftover rejected
// markup (e.g. `&lt;div onclick=...` -> `&amp;lt;div onclick=...`) on every
// pass, breaking idempotency for exactly the mixed "some allowlisted, some
// rejected" content this sanitizer exists to handle. A real `<`/`>`/`"`
// character is always re-escaped unconditionally on every pass — only the
// leading `&` of an already-well-formed entity is left alone.
function escapeHtml(html: string): string {
  return html
    .replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Attribute-less tags that unescape verbatim in both directions. Any tag
// carrying attributes (e.g. `<span style="...">`) simply doesn't match
// these exact literal patterns and stays escaped.
const BARE_TAGS = ["p", "strong", "em", "u", "span"];

// `<br>`, `<br/>`, and `<br />` all normalize to a single void `<br>`.
const BR_RE = /&lt;br\s*\/?&gt;/g;

// Anchors: matched on the already-escaped text. The href charset
// deliberately excludes `&` (so no entity can hide inside — a literal `&`
// in a URL becomes `&amp;` and simply fails to match, which is an
// acceptable loss for owner-authored copy) and excludes whitespace, quotes,
// and angle brackets (so a nested tag can't be smuggled in and reassembled
// across the boundary). The trailing optional group also matches this
// sanitizer's own output verbatim, which is what makes it idempotent:
// re-running it on already-sanitized output must reproduce the same
// output, not strip the `target`/`rel` it just added.
const ANCHOR_RE =
  /&lt;a href=&quot;([A-Za-z0-9:/?#[\]@!$'()*+,;=._~%-]*)&quot;(?: target=&quot;_blank&quot; rel=&quot;noopener noreferrer&quot;)?&gt;/g;

// Only these schemes are ever unescaped into a live `href` — an allowlist,
// not a `javascript:`/`data:`-specific denylist, so it isn't a pattern that
// needs to keep growing as new dangerous schemes are discovered.
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/)/i;

export function sanitizeHtml(html: string): string {
  let out = escapeHtml(html);

  for (const tag of BARE_TAGS) {
    out = out.split(`&lt;${tag}&gt;`).join(`<${tag}>`);
    out = out.split(`&lt;/${tag}&gt;`).join(`</${tag}>`);
  }
  out = out.split("&lt;/a&gt;").join("</a>");

  out = out.replace(BR_RE, "<br>");

  out = out.replace(ANCHOR_RE, (match, href: string) => {
    if (!SAFE_HREF_RE.test(href)) return match;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
  });

  return out;
}
