import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../sanitize";

describe("sanitizeHtml", () => {
  it("strips <script> tags and their content entirely", () => {
    const out = sanitizeHtml('<p>Xin chào</p><script>alert("evil")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("Xin chào");
  });

  it("strips inline on* event handlers", () => {
    const out = sanitizeHtml('<p onclick="alert(1)">Click</p>');
    expect(out).not.toContain("onclick");
    expect(out).not.toMatch(/on\w+\s*=/i);
    expect(out).toContain("Click");
  });

  it("strips javascript: hrefs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">Link</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("Link");
  });

  it("strips javascript: hrefs that use whitespace/control-char obfuscation", () => {
    const out = sanitizeHtml('<a href="\tjav\nascript:alert(1)">Link</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("keeps the allowlisted tags: p, a[href], strong, em, br, u, span", () => {
    const out = sanitizeHtml(
      '<p>Hello <strong>World</strong> <em>foo</em><br/><u>bar</u> <span>baz</span> ' +
        '<a href="https://example.com">link</a></p>',
    );
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<br>");
    expect(out).toContain("<u>");
    expect(out).toContain("<span>");
    expect(out).toContain('<a href="https://example.com">');
  });

  it("drops tags outside the allowlist but keeps their text content", () => {
    const out = sanitizeHtml('<div class="x"><iframe src="evil"></iframe>Hello</div>');
    expect(out).not.toContain("<div");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("Hello");
  });

  it("drops attributes other than href on <a>", () => {
    const out = sanitizeHtml('<a href="https://x.com" style="color:red" target="_blank">x</a>');
    expect(out).toBe('<a href="https://x.com">x</a>');
  });
});
