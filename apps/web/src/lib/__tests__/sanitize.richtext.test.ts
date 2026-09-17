import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../sanitize";

/**
 * Guards the allowlist expansion that Task 8 needs for the TipTap rich-text
 * editor (`h2 h3 ul ol li blockquote s`).
 *
 * Kept in its own file, separate from `sanitize.test.ts`, precisely so the
 * original 20 cases stay untouched: they are the evidence that two prior
 * bypass rounds are still closed, and an expansion that had to edit them
 * would be an expansion that changed behaviour rather than added tags.
 *
 * Every case here is written against the RAW OUTPUT STRING, not a parsed
 * DOM, because the output is handed to `dangerouslySetInnerHTML` verbatim —
 * an unescaped `<tag` boundary in this string is exactly what decides
 * whether something becomes a live element in a guest's browser.
 */

// Mirrors the helper in sanitize.test.ts: a "live" tag is an unescaped
// `<tagname` boundary in the raw output. `&lt;tagname` never matches.
function hasLiveTag(html: string, tagName: string): boolean {
  return new RegExp(`<${tagName}\\b`, "i").test(html);
}

describe("sanitizeHtml — rich-text tags must not open an attribute hole", () => {
  it("escapes <li onclick=...> whole — an attributed tag is not the exact allowlisted string", () => {
    const out = sanitizeHtml('<ul><li onclick="alert(1)">x</li></ul>');

    // Asserted as the whole output string, not as substring absence: this
    // sanitizer ESCAPES rather than strips, so the word "onclick" is still
    // present — as inert visible text, with no unescaped `<` in front of
    // it to make it an attribute. Full-string equality is what pins that
    // distinction; `not.toContain("onclick")` would be asserting a
    // behaviour this sanitizer deliberately does not have.
    expect(out).toBe('<ul>&lt;li onclick=&quot;alert(1)&quot;&gt;x</li></ul>');
    expect(hasLiveTag(out, "li")).toBe(false);
  });

  it("escapes <ul style=...> (any attribute at all disqualifies the tag)", () => {
    const out = sanitizeHtml('<ul style="position:fixed;top:0">x</ul>');

    // The style text survives as escaped visible text (see above); what
    // must not survive is the `<ul ` boundary that would make it a real
    // declaration capable of covering the page.
    expect(out).toBe('&lt;ul style=&quot;position:fixed;top:0&quot;&gt;x</ul>');
    expect(hasLiveTag(out, "ul")).toBe(false);
  });

  it("escapes an end tag carrying attributes: </li foo=bar>", () => {
    // `</li ` differs from the allowlisted `</li>` at the 5th character, so
    // it can never be an exact match — but assert it, because "close tags
    // can't carry attributes" is a browser-parser assumption, not a
    // sanitizer one, and the sanitizer must not rely on it.
    const out = sanitizeHtml("</li foo=bar>");

    expect(hasLiveTag(out, "/li")).toBe(false);
    expect(out).toBe("&lt;/li foo=bar&gt;");
  });

  it("keeps <script> inert inside an allowlisted <h2>", () => {
    const out = sanitizeHtml("<h2><script>alert(1)</script></h2>");

    expect(hasLiveTag(out, "script")).toBe(false);
    expect(out).toContain("<h2>");
    expect(out).toContain("</h2>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("still rejects a javascript: href when it sits inside a <li>", () => {
    // The new block tags must not become a context in which anchor
    // recognition behaves differently — the walker has no notion of
    // nesting, and this pins that.
    const out = sanitizeHtml('<ul><li><a href="javascript:alert(1)">bấm</a></li></ul>');

    expect(out).toBe(
      '<ul><li>&lt;a href=&quot;javascript:alert(1)&quot;&gt;bấm&lt;/a&gt;</li></ul>',
    );
    expect(hasLiveTag(out, "a")).toBe(false);
    // The list structure around it is untouched — rejection is per-tag.
    expect(out).toContain("<li>");
  });

  it("does not reconstruct a live <li> out of escaped text inside a rejected <div>", () => {
    // The round-2 regression class, re-asserted for the newly allowlisted
    // tags: recognition fires only on a literal raw `<`, so pre-escaped
    // text sitting inside a rejected element can never be promoted back.
    const out = sanitizeHtml("<div>&lt;li&gt;smuggled&lt;/li&gt;</div>");

    expect(hasLiveTag(out, "li")).toBe(false);
    expect(hasLiveTag(out, "div")).toBe(false);
  });

  it("does not materialize a live <h2> out of text inside a rejected href value", () => {
    const out = sanitizeHtml('<a href="foo&lt;h2&gt;bar">bấm</a>');

    expect(hasLiveTag(out, "h2")).toBe(false);
    expect(hasLiveTag(out, "a")).toBe(false);
  });

  it("does not let <s> shadow <span> or <strong> (shorter tag is not a prefix match)", () => {
    // `<s>` is the first three characters of neither `<span>` nor
    // `<strong>` — the `>` terminates it. If LITERAL_TAGS matching ever
    // became prefix-based instead of exact, `<span style=...>` would start
    // matching as `<s>` and the attributes would be emitted live.
    const out = sanitizeHtml('<s>bỏ</s><span>giữ</span><strong>đậm</strong><span style="x">xấu</span>');

    expect(out).toContain("<s>bỏ</s>");
    expect(out).toContain("<span>giữ</span>");
    expect(out).toContain("<strong>đậm</strong>");
    expect(out).not.toContain('<span style');
  });

  it("is idempotent over input that uses every newly allowlisted tag", () => {
    const rich =
      "<h2>Tiêu đề</h2><h3>Phụ đề</h3>" +
      "<ul><li><p>một</p></li><li><p>hai</p></li></ul>" +
      "<ol><li><p>ba</p></li></ol>" +
      "<blockquote><p>trích <s>cũ</s> <strong>mới</strong></p></blockquote>" +
      '<p><a href="https://example.com/x">liên kết</a></p>' +
      '<p>&lt;script&gt; &amp; <li onclick="x">rác</li></p>';

    const once = sanitizeHtml(rich);
    expect(sanitizeHtml(once)).toBe(once);
    // A third pass too: idempotency that only holds for one extra round
    // would mean the output is still drifting.
    expect(sanitizeHtml(sanitizeHtml(once))).toBe(once);
  });
});

describe("sanitizeHtml — rich-text tags the editor actually needs", () => {
  it("keeps <ul> and <li>", () => {
    expect(sanitizeHtml("<ul><li>một</li><li>hai</li></ul>")).toBe("<ul><li>một</li><li>hai</li></ul>");
  });

  it("keeps <ol> and <li>", () => {
    expect(sanitizeHtml("<ol><li>một</li></ol>")).toBe("<ol><li>một</li></ol>");
  });

  it("keeps <h2> and <h3>", () => {
    expect(sanitizeHtml("<h2>Tiêu đề</h2><h3>Phụ đề</h3>")).toBe("<h2>Tiêu đề</h2><h3>Phụ đề</h3>");
  });

  it("keeps <blockquote>", () => {
    expect(sanitizeHtml("<blockquote>trích dẫn</blockquote>")).toBe("<blockquote>trích dẫn</blockquote>");
  });

  it("keeps <s> (strikethrough)", () => {
    expect(sanitizeHtml("<s>đã huỷ</s>")).toBe("<s>đã huỷ</s>");
  });

  it("keeps the nesting TipTap actually emits for a list item (a <p> inside the <li>)", () => {
    const tiptapShape = "<ul><li><p>mục một</p></li></ul>";
    expect(sanitizeHtml(tiptapShape)).toBe(tiptapShape);
  });

  it("does NOT allowlist <h1> — the invitation page owns the page heading", () => {
    // TipTap's StarterKit is configured to offer only levels 2 and 3. If
    // that config ever regressed, an <h1> from the editor must still be
    // inert rather than competing with the invitation's own title for
    // document outline and SEO.
    expect(hasLiveTag(sanitizeHtml("<h1>cướp tiêu đề</h1>"), "h1")).toBe(false);
  });
});
