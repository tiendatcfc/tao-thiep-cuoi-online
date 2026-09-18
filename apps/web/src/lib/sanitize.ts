/**
 * Single-pass, left-to-right tokenizing sanitizer for owner-authored rich
 * text (the `text` section's `props.html`).
 *
 * History (two prior bypass rounds, both fixed by changing the strategy
 * rather than patching a rule):
 *
 *   Round 1 — a tag-matching-regex sanitizer had two reproducible bypasses:
 *     1. Nested-tag reconstruction: `<a href="jav<b>ascript:alert(1)">` —
 *        the regex couldn't match the outer `<a>` (its attrs group stopped
 *        at the first `<`), so the inner `<b>` got matched/stripped in
 *        isolation and the untouched surrounding text reassembled a live
 *        `javascript:` href once concatenated back together.
 *     2. Entity-encoded scheme: `href="&#106;avascript:alert(1)"` — a
 *        denylist check on the raw string never saw "javascript:"; the
 *        browser only decodes `&#106;` -> "j" at HTML-parse time, after the
 *        check had already passed it.
 *
 *   Round 2 — the escape-first/selectively-unescape rewrite that followed
 *   fixed both of those, but its allowlist regexes ran over the fully
 *   ESCAPED text as a whole buffer, with no notion of where a match sat in
 *   the original document. That let an allowlisted-*looking* escaped
 *   pattern get unescaped back into live markup even when it started out
 *   *inside* a rejected attribute value or a rejected tag's body — e.g.
 *   `<a href="foo&lt;p&gt;bar">` produced a live `<p>` out of href-value
 *   text that was never meant to be markup, and a `<div>` wrapping a
 *   pre-escaped anchor could reconstruct a live, clickable link.
 *
 * This version walks the RAW input exactly once, left to right, and only
 * ever asks "does an allowlisted construct start at *this exact position*
 * in the ORIGINAL text?" — it never re-matches against text this function
 * already produced. Unescaping only ever happens at the single raw `<`
 * character a construct starts with, consuming exactly the raw characters
 * that make it up; there is no whole-buffer regex pass for a rejected
 * value's contents to "leak" through, because recognition only fires on a
 * literal, untouched `<` in the source.
 *
 * Anything that isn't an exact allowlisted match — including a `<a>` with
 * an unsafe scheme, and a `</a>` with no matching accepted `<a>` open —
 * stays as escaped, inert text.
 */

// Attribute-less tags recognized verbatim, in both directions, wherever
// they appear literally in the raw input. A tag carrying any attribute
// (e.g. `<span style="...">`) simply isn't one of these exact strings and
// falls through to the generic per-character escaping below.
//
// Extending rich-text support means adding a NAME to this list and nothing
// else — the tokenizer below stays untouched. Matching is exact-string
// (`startsWith` on the full `<tag>` including the `>`), so a short name is
// never a prefix of a longer tag: `<s>` cannot shadow `<span>` or
// `<strong>`, because the `>` differs from `p`/`t` at the third character.
// The block tags below are the ones TipTap's StarterKit emits (Task 8).
// `h1` is deliberately absent: the invitation page owns the page heading,
// and a section body must not be able to compete with it.
const BARE_TAGS = [
  "p",
  "strong",
  "em",
  "u",
  "s",
  "span",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
];
const LITERAL_TAGS: string[] = [];
for (const tag of BARE_TAGS) {
  LITERAL_TAGS.push(`<${tag}>`, `</${tag}>`);
}

// Longest-first so `<br />` (with the space) isn't shadowed by a shorter
// prefix — with exact `startsWith` matching this only matters for clarity,
// since none of these three strings is a literal prefix of another anyway.
const BR_VARIANTS = ["<br />", "<br/>", "<br>"];

// Anchors: recognized directly on the RAW input at the position a literal
// `<a href="` starts. The href charset excludes `&`, whitespace, quotes,
// and angle brackets, so nothing — no entity, no nested tag — can appear
// inside the match; matching stops the instant a disallowed character is
// hit, well before any embedded markup could be reassembled. The second
// alternative also matches this sanitizer's own previously-expanded output
// (with the `target`/`rel` it adds) verbatim, which is what makes
// re-sanitizing already-sanitized output idempotent.
const HREF_CHARSET = "[A-Za-z0-9:/?#[\\]@!$'()*+,;=._~%-]*";
const ANCHOR_OPEN_RE = new RegExp(
  `^<a href="(${HREF_CHARSET})">` +
    "|" +
    `^<a href="(${HREF_CHARSET})" target="_blank" rel="noopener noreferrer">`,
);

// Only these schemes are ever unescaped into a live `href` — an allowlist,
// not a `javascript:`/`data:`-specific denylist, so it isn't a pattern that
// needs to keep growing as new dangerous schemes are discovered.
//
// The final alternative is "a local path", and it must NOT match a
// PROTOCOL-RELATIVE url. `//evil.com` starts with a slash but resolves
// against the current page's scheme and replaces the HOST, so on
// https://hpwd.vn/i/abc it navigates to https://evil.com — verified with
// `new URL("//evil.com", "https://hpwd.vn/i/abc")`. `/\evil.com` is the
// same destination: for http(s) the WHATWG url parser treats a backslash
// in the authority-slashes position as a slash, and Node resolves it to
// https://evil.com too. Both read as "internal link" to whoever pasted
// them. The negative lookahead keeps every genuine path (`/`, `/i/demo`,
// and even `/a//b`, where the doubled slash is inside the path rather than
// at the front) matching exactly as before.
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/(?![/\\]))/i;

// Recognized when escaping a lone `&` in the generic per-character path —
// named, decimal, and hex character references. This is what makes
// re-sanitizing idempotent for inert leftover entity text (e.g. `&lt;div
// onclick=...` from a rejected tag isn't double-escaped into `&amp;lt;...`
// on a second pass). It's safe *because* this function only ever
// recognizes tags at a raw `<` — this carve-out never runs anywhere near
// that logic, so it can only leave already-inert text looking the same on
// a re-pass; it can never promote anything into live markup.
const KNOWN_ENTITY_RE = /^(amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-fA-F]+;)/;

/**
 * Scheme allowlist for user-supplied plain hrefs rendered as real anchors
 * outside the rich-text sanitizer (today: EventsSection's mapUrl). Same
 * allowlist the sanitizer applies to rich-text anchors — one list, two
 * enforcement points that can't drift.
 */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF_RE.test(href);
}

/**
 * Sanitizes free-text guest input (wish messages, guest names) that is
 * stored and rendered as plain text — never `dangerouslySetInnerHTML` — so
 * there is no markup to escape here, unlike `sanitizeHtml` above. Two
 * concerns instead:
 *
 *   1. Control characters (C0 range + DEL) have no legitimate place in a
 *      wedding wish and can corrupt terminals/logs/exports that later
 *      display this text raw. `\t` and `\n` are kept since they're
 *      expected in a multi-line message; `\r` is normalized into `\n`
 *      first so Windows/old-Mac line endings don't survive as stray
 *      characters once CR is stripped.
 *   2. A guest pasting a wall of blank lines could otherwise stretch the
 *      wishes list arbitrarily — runs of 3+ newlines collapse to exactly 2
 *      (i.e. at most one fully blank line between paragraphs).
 */
export function sanitizePlainText(text: string): string {
  const normalizedNewlines = text.replace(/\r\n?/g, "\n");
  // C0 control chars (0x00-0x1F) minus \t (0x09) and \n (0x0A), plus DEL
  // (0x7F). Written as explicit \uXXXX escapes rather than literal bytes so
  // the source file itself stays plain ASCII and diff/grep-friendly.
  const withoutControlChars = normalizedNewlines.replace(
    /[\u0000-\u0008\u000B-\u001F\u007F]/g,
    "",
  );
  return withoutControlChars.replace(/\n{3,}/g, "\n\n");
}

export function sanitizeHtml(html: string): string {
  let out = "";
  let i = 0;
  let anchorDepth = 0;

  while (i < html.length) {
    const ch = html[i];

    if (ch === "<") {
      const rest = html.slice(i);

      const literalTag = LITERAL_TAGS.find((tag) => rest.startsWith(tag));
      if (literalTag) {
        out += literalTag;
        i += literalTag.length;
        continue;
      }

      const brTag = BR_VARIANTS.find((tag) => rest.startsWith(tag));
      if (brTag) {
        out += "<br>";
        i += brTag.length;
        continue;
      }

      const anchorMatch = ANCHOR_OPEN_RE.exec(rest);
      if (anchorMatch) {
        const href = anchorMatch[1] ?? anchorMatch[2] ?? "";
        if (SAFE_HREF_RE.test(href)) {
          out += `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
          anchorDepth += 1;
          i += anchorMatch[0].length;
          continue;
        }
        // Syntactically an anchor, but an unsafe scheme: fall through to
        // the generic path below, which escapes it character by character.
      }

      if (anchorDepth > 0 && rest.startsWith("</a>")) {
        out += "</a>";
        anchorDepth -= 1;
        i += 4;
        continue;
      }

      // No allowlisted construct starts here — including a `</a>` with no
      // accepted `<a>` currently open, which is what keeps an orphan
      // closing tag from ever becoming live. Escape just the "<"; every
      // other character in this run gets handled by the generic path
      // below on subsequent iterations.
      out += "&lt;";
      i += 1;
      continue;
    }

    if (ch === ">") {
      out += "&gt;";
    } else if (ch === '"') {
      out += "&quot;";
    } else if (ch === "&") {
      out += KNOWN_ENTITY_RE.test(html.slice(i + 1)) ? "&" : "&amp;";
    } else {
      out += ch;
    }
    i += 1;
  }

  return out;
}
