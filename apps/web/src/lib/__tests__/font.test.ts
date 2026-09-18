import { describe, expect, it } from "vitest";
import {
  FONT_ACCEPT_ATTRIBUTE,
  FONT_EXTENSIONS,
  MAX_FONT_FAMILY_LENGTH,
  MAX_FONT_SIZE_BYTES,
  VIETNAMESE_GLYPH_SAMPLE,
  fontExtensionOf,
  fontObjectKey,
  sanitizeFontFamily,
  sanitizeFontSrcUrl,
} from "../font";

describe("font upload limits", () => {
  it("caps uploads at the 5MB the spec promises", () => {
    expect(MAX_FONT_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("accepts exactly the three formats, and the accept attribute lists all of them", () => {
    expect([...FONT_EXTENSIONS]).toEqual([".ttf", ".otf", ".woff2"]);
    for (const ext of FONT_EXTENSIONS) {
      expect(FONT_ACCEPT_ATTRIBUTE).toContain(ext);
    }
  });
});

describe("fontExtensionOf", () => {
  it.each([
    ["Roboto.ttf", ".ttf"],
    ["Roboto.otf", ".otf"],
    ["Roboto.woff2", ".woff2"],
    ["UPPER.TTF", ".ttf"],
    ["many.dots.in.name.woff2", ".woff2"],
  ])("recognises %s", (name, expected) => {
    expect(fontExtensionOf(name)).toBe(expected);
  });

  it.each(["Roboto.eot", "Roboto", "Roboto.ttf.exe", ".ttf.png", ""])("rejects %s", (name) => {
    expect(fontExtensionOf(name)).toBeNull();
  });

  it("rejects .woff — WOFF1 is not in the allowlist and wawoff2 cannot read it", () => {
    expect(fontExtensionOf("old.woff")).toBeNull();
  });
});

describe("fontObjectKey", () => {
  it("namespaces by user and always ends in .woff2 (everything is converted)", () => {
    expect(fontObjectKey("user-1", "asset-9")).toBe("u/user-1/asset-9.woff2");
  });
});

describe("sanitizeFontFamily — the CSS injection boundary", () => {
  /**
   * The family name comes from metadata INSIDE a font file an untrusted
   * user uploaded, and it ends up interpolated into a `@font-face` rule.
   * A name carrying a quote or a brace escapes the declaration and can
   * rewrite the rest of the stylesheet — which, on a wedding invitation, is
   * a full-page defacement served from the couple's own domain.
   *
   * These cases assert an ALLOWLIST, not the absence of specific payloads:
   * what is checked for each one is that no structural CSS character
   * survives at all, whatever the input tried.
   */
  const STRUCTURAL = ['"', "'", "\\", "{", "}", ";", "<", ">", "/", "(", ")", ":", "@", "*"];

  it.each([
    'Evil"; } body { display: none } .x { font-family: "Y',
    "Roboto'; background: url(https://evil.example/leak); '",
    "</style><script>alert(1)</script>",
    "Font\\22 name",
    "a{}b",
    "@import url(evil.css)",
  ])("strips every structural character out of %j", (hostile) => {
    const cleaned = sanitizeFontFamily(hostile);
    for (const ch of STRUCTURAL) {
      expect(cleaned ?? "", `"${ch}" survived`).not.toContain(ch);
    }
  });

  it("removes newlines and control characters, which can break out of a declaration too", () => {
    expect(sanitizeFontFamily("Ro\nbo\r\tto\u0000")).toBe("Ro bo to");
  });

  it("keeps Vietnamese letters — a Vietnamese font may legitimately be named in Vietnamese", () => {
    expect(sanitizeFontFamily("Chữ Đẹp Việt")).toBe("Chữ Đẹp Việt");
  });

  it("keeps digits and hyphens, which real font names use", () => {
    expect(sanitizeFontFamily("Roboto-2 Condensed 700")).toBe("Roboto-2 Condensed 700");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(sanitizeFontFamily("  Noto    Sans  ")).toBe("Noto Sans");
  });

  it("caps the length, so a megabyte-long name cannot bloat every rendered page", () => {
    const cleaned = sanitizeFontFamily("A".repeat(5_000));
    expect(cleaned).toHaveLength(MAX_FONT_FAMILY_LENGTH);
  });

  it("returns null when nothing usable survives, rather than an empty family", () => {
    // An empty `font-family: ""` is invalid CSS and would silently drop the
    // font; the caller has to be able to tell and refuse the upload.
    expect(sanitizeFontFamily('{};"')).toBeNull();
    expect(sanitizeFontFamily("   ")).toBeNull();
    expect(sanitizeFontFamily("")).toBeNull();
    expect(sanitizeFontFamily(undefined)).toBeNull();
    expect(sanitizeFontFamily(null)).toBeNull();
  });

  it("is idempotent — re-sanitizing a stored family never changes it again", () => {
    for (const input of ["Noto Sans", "Chữ Đẹp Việt", "Roboto-2 Condensed 700"]) {
      const once = sanitizeFontFamily(input);
      expect(sanitizeFontFamily(once)).toBe(once);
    }
  });
});

describe("VIETNAMESE_GLYPH_SAMPLE", () => {
  it("covers the vowels and tone marks the spec names", () => {
    for (const ch of "ăâđêôơư") expect(VIETNAMESE_GLYPH_SAMPLE).toContain(ch);
    for (const ch of "ẮẰẲẴẶ") expect(VIETNAMESE_GLYPH_SAMPLE).toContain(ch);
  });

  it("contains no spaces — every character in it is looked up as a glyph", () => {
    expect(VIETNAMESE_GLYPH_SAMPLE).not.toMatch(/\s/);
  });
});

describe("sanitizeFontSrcUrl — the @font-face src boundary", () => {
  it("keeps an ordinary stored font URL", () => {
    expect(sanitizeFontSrcUrl("https://cdn.example.com/u/user-1/asset-9.woff2")).toBe(
      "https://cdn.example.com/u/user-1/asset-9.woff2",
    );
  });

  it("keeps a site-relative URL", () => {
    expect(sanitizeFontSrcUrl("/fonts/local.woff2")).toBe("/fonts/local.woff2");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFontSrcUrl("  https://cdn.example.com/a.woff2  ")).toBe("https://cdn.example.com/a.woff2");
  });

  it.each([
    'https://ok.example/a.woff2"); } body { display: none } @font-face { src: url("x',
    "https://ok.example/a.woff2'); color: red; url('",
    "https://ok.example/a(1).woff2",
    "https://ok.example/a b.woff2",
    "https://ok.example/a;b.woff2",
    "https://ok.example/<script>",
  ])("refuses %j, which would escape the url() token", (hostile) => {
    expect(sanitizeFontSrcUrl(hostile)).toBeNull();
  });

  it("refuses schemes outside the shared allowlist, including data: fonts", () => {
    // A data: URL would embed a whole font inside the invitation document,
    // sidestepping the upload route's size cap and fontkit validation
    // entirely.
    expect(sanitizeFontSrcUrl("data:font/woff2;base64,AAAA")).toBeNull();
    expect(sanitizeFontSrcUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeFontSrcUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses empty input", () => {
    expect(sanitizeFontSrcUrl("")).toBeNull();
    expect(sanitizeFontSrcUrl("   ")).toBeNull();
    expect(sanitizeFontSrcUrl(null)).toBeNull();
    expect(sanitizeFontSrcUrl(undefined)).toBeNull();
  });
});
