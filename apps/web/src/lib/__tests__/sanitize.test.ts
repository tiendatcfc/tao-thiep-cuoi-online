import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../sanitize";

// A "live" anchor/script/etc tag is one that would actually parse as an
// element when the sanitizer's output is mounted via
// `dangerouslySetInnerHTML` — i.e. an unescaped `<tagname` boundary in the
// raw output string. Escaped markup (`&lt;tagname`) never triggers this.
function hasLiveTag(html: string, tagName: string): boolean {
  return new RegExp(`<${tagName}\\b`, "i").test(html);
}

describe("sanitizeHtml — security review regressions", () => {
  it("bypass 1: nested-tag reconstruction cannot smuggle a javascript: href", () => {
    // A tag-matching regex can't match the outer <a> (attrs stop at the
    // first "<"), so a naive sanitizer strips only the inner <b> and
    // String.replace concatenation reassembles a live javascript: href.
    const out = sanitizeHtml('<a href="jav<b>ascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(hasLiveTag(out, "a")).toBe(false);
    expect(hasLiveTag(out, "b")).toBe(false);
  });

  it("bypass 2: a decimal HTML entity in the scheme cannot reach a live href", () => {
    // The browser decodes &#106; -> "j" at HTML-parse time, after any
    // raw-string denylist check has already passed it.
    const out = sanitizeHtml('<a href="&#106;avascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(hasLiveTag(out, "a")).toBe(false);
  });

  it("a hex HTML entity in the scheme cannot reach a live href either", () => {
    const out = sanitizeHtml('<a href="&#x6A;avascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(hasLiveTag(out, "a")).toBe(false);
  });

  it("rejects javascript: regardless of case (allowlist, not a denylist keyword match)", () => {
    const out = sanitizeHtml('<a href="JAVASCRIPT:alert(1)">click</a>');
    expect(hasLiveTag(out, "a")).toBe(false);
  });

  it("rejects data: URLs (scheme allowlist, not a scheme-specific denylist)", () => {
    const out = sanitizeHtml('<a href="data:text/html,alert(1)">click</a>');
    expect(hasLiveTag(out, "a")).toBe(false);
  });
});

describe("sanitizeHtml — happy path", () => {
  it("keeps bare allowlisted tags: p, strong, em, u, span, br", () => {
    const out = sanitizeHtml("<p>Hello <strong>World</strong> <em>foo</em><br/><u>bar</u> <span>baz</span></p>");
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>World</strong>");
    expect(out).toContain("<em>foo</em>");
    expect(out).toContain("<br>");
    expect(out).toContain("<u>bar</u>");
    expect(out).toContain("<span>baz</span>");
  });

  it("normalizes every <br> spelling to a bare void tag", () => {
    expect(sanitizeHtml("a<br>b")).toContain("<br>");
    expect(sanitizeHtml("a<br/>b")).toContain("<br>");
    expect(sanitizeHtml("a<br />b")).toContain("<br>");
  });

  it("unescapes a valid https:// anchor and adds target/rel", () => {
    const out = sanitizeHtml('<a href="https://example.com">Link</a>');
    expect(out).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>');
  });

  it("unescapes a valid site-relative anchor", () => {
    const out = sanitizeHtml('<a href="/about">About</a>');
    expect(out).toBe('<a href="/about" target="_blank" rel="noopener noreferrer">About</a>');
  });

  it("unescapes a valid mailto: anchor", () => {
    const out = sanitizeHtml('<a href="mailto:hi@example.com">Email</a>');
    expect(out).toBe('<a href="mailto:hi@example.com" target="_blank" rel="noopener noreferrer">Email</a>');
  });

  it("leaves <img> escaped/inert", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(hasLiveTag(out, "img")).toBe(false);
  });

  it("leaves <iframe> escaped/inert", () => {
    const out = sanitizeHtml('<iframe src="evil"></iframe>Hello');
    expect(hasLiveTag(out, "iframe")).toBe(false);
    expect(out).toContain("Hello");
  });

  it("leaves an attributed <span> escaped/inert (attributes are not on the allowlist)", () => {
    const out = sanitizeHtml('<span style="color:red">text</span>');
    expect(out).not.toContain('<span style');
    expect(out).not.toContain('<span>text');
  });

  it("still escapes an ordinary & in plain content (the idempotency fix doesn't disable this)", () => {
    expect(sanitizeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
});

describe("sanitizeHtml — idempotency", () => {
  const fixture =
    '<p>Hi <strong>there</strong><br/></p>' +
    '<a href="https://example.com">link</a>' +
    '<a href="javascript:alert(1)">bad</a>' +
    '<div onclick="alert(1)">Hello</div>';

  it("re-sanitizing already-sanitized output is a no-op", () => {
    const once = sanitizeHtml(fixture);
    const twice = sanitizeHtml(once);
    expect(twice).toBe(once);
  });

  it("re-sanitizing a lone valid anchor is a no-op (target/rel don't get re-escaped away)", () => {
    const once = sanitizeHtml('<a href="https://example.com">Link</a>');
    const twice = sanitizeHtml(once);
    expect(twice).toBe(once);
  });
});
