// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  MAX_RICH_TEXT_HTML_LENGTH,
  RICH_TEXT_EXTENSIONS,
  RichTextLengthGuard,
  acceptsDocChange,
  normalizeLinkHref,
  sanitizedHtmlLength,
  stripTrailingEmptyParagraph,
} from "../rich-text";

/**
 * The contract between TipTap and `sanitizeHtml`, exercised through a REAL
 * editor rather than by asserting against hand-written HTML strings.
 *
 * That distinction is the whole value of this file: the bug it exists to
 * prevent (stock TipTap rendering `target`/`rel` before `href`, which the
 * sanitizer escapes) is invisible to any test that writes the expected
 * markup by hand, because the markup a human writes is not the markup
 * ProseMirror's serializer produces.
 */

let editor: Editor | null = null;

function makeEditor(content = ""): Editor {
  editor?.destroy();
  editor = new Editor({
    element: document.createElement("div"),
    extensions: RICH_TEXT_EXTENSIONS,
    content,
  });
  return editor;
}

/** What the panel would push into the store for the given editor state. */
function stored(e: Editor): string {
  return sanitizeHtml(e.getHTML());
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("rich-text extensions — everything the editor can emit survives the sanitizer", () => {
  it("passes bold, italic, underline and strike through untouched", () => {
    const e = makeEditor("<p>xin chào</p>");
    e.commands.selectAll();
    e.commands.toggleBold();
    e.commands.toggleItalic();
    e.commands.toggleUnderline();
    e.commands.toggleStrike();

    const html = stored(e);
    expect(html).toBe(e.getHTML());
    for (const tag of ["strong", "em", "u", "s"]) {
      expect(html).toContain(`<${tag}>`);
    }
  });

  it("passes headings, lists and blockquote through untouched", () => {
    for (const [name, run] of [
      ["heading", (e: Editor) => e.commands.toggleHeading({ level: 2 })],
      ["bulletList", (e: Editor) => e.commands.toggleBulletList()],
      ["orderedList", (e: Editor) => e.commands.toggleOrderedList()],
      ["blockquote", (e: Editor) => e.commands.toggleBlockquote()],
    ] as const) {
      const e = makeEditor("<p>nội dung</p>");
      e.commands.selectAll();
      run(e);
      expect(stored(e), name).toBe(e.getHTML());
      expect(stored(e), name).toContain("nội dung");
    }
  });

  it("emits a bare <a href> that the sanitizer accepts and decorates itself", () => {
    const e = makeEditor("<p>trang chủ</p>");
    e.commands.selectAll();
    e.commands.setLink({ href: "https://hpwd.vn/gioi-thieu" });

    // The editor's own output carries no target/rel — that is the fix.
    expect(e.getHTML()).toBe('<p><a href="https://hpwd.vn/gioi-thieu">trang chủ</a></p>');
    expect(stored(e)).toBe(
      '<p><a href="https://hpwd.vn/gioi-thieu" target="_blank" rel="noopener noreferrer">trang chủ</a></p>',
    );
  });

  it("re-opening a saved document and editing does not destroy its links", () => {
    // THE regression this module exists for. Stock TipTap parses the
    // `target`/`rel` the sanitizer added back into mark attributes and
    // re-renders them ahead of `href`, which the sanitizer then escapes —
    // so the link survived the first save and died on the next keystroke
    // after a reload, which no single-pass test would ever notice.
    const savedByAPreviousSession =
      '<p><a href="https://hpwd.vn/x" target="_blank" rel="noopener noreferrer">liên kết</a></p>';

    const e = makeEditor(savedByAPreviousSession);

    expect(stored(e)).toBe(savedByAPreviousSession);
    // And it stays fixed across further round trips, not just the first.
    const twice = makeEditor(stored(e));
    expect(stored(twice)).toBe(savedByAPreviousSession);
  });
});

describe("rich-text extensions — things the editor must be unable to produce", () => {
  it("refuses a javascript: link (TipTap's own URI check, before the sanitizer sees it)", () => {
    const e = makeEditor("<p>bấm</p>");
    e.commands.selectAll();
    e.commands.setLink({ href: "javascript:alert(1)" });

    expect(e.getHTML()).not.toContain("javascript:");
    expect(stored(e)).not.toContain("<a ");
  });

  it("drops pasted <img onerror>, <script> and attributed wrappers at the schema boundary", () => {
    for (const hostile of [
      '<p><img src=x onerror=alert(1)>giữ</p>',
      "<p>giữ<script>alert(1)</script></p>",
      '<div style="position:fixed"><p>giữ</p></div>',
      '<p><span onmouseover="alert(1)">giữ</span></p>',
    ]) {
      const e = makeEditor(hostile);
      const html = stored(e);
      expect(html, hostile).toContain("giữ");
      expect(html, hostile).not.toMatch(/onerror|onmouseover|position:fixed|alert\(1\)/);
      expect(html, hostile).not.toContain("<img");
    }
  });

  it("cannot produce <h1>, <hr>, <pre> or inline <code> — the extensions are off, not cleaned up after", () => {
    const e = makeEditor("<h1>a</h1><hr><pre><code>b</code></pre><p><code>c</code></p>");
    const html = stored(e);

    for (const tag of ["h1", "hr", "pre", "code"]) {
      expect(html, tag).not.toContain(`<${tag}`);
    }
    // The text is kept — content is demoted to a paragraph, never deleted.
    expect(html).toContain("a");
    expect(html).toContain("b");
    expect(html).toContain("c");
  });

  it("produces nothing that sanitizing would change, for a document using every feature at once", () => {
    const e = makeEditor(
      "<h2>Chương trình</h2>" +
        "<ul><li><p>Đón khách</p></li><li><p><strong>Lễ</strong> <em>chính</em></p></li></ul>" +
        "<ol><li><p>Một</p></li></ol>" +
        "<blockquote><p><s>Huỷ</s> <u>Mới</u></p></blockquote>" +
        '<p>Xem <a href="https://hpwd.vn/">tại đây</a>.<br>Cảm ơn.</p>',
    );

    // Idempotence at the boundary: the stored value is already a fixed
    // point, so `TextSection` sanitizing again at render changes nothing.
    const html = stored(e);
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe("sanitizedHtmlLength", () => {
  it("measures the SANITIZED length, which for a link exceeds the editor's own output", () => {
    const e = makeEditor("<p>x</p>");
    e.commands.selectAll();
    e.commands.setLink({ href: "https://hpwd.vn/" });

    const raw = e.getHTML().length;
    const measured = sanitizedHtmlLength(e.state.doc);

    expect(measured).toBe(stored(e).length);
    // ` target="_blank" rel="noopener noreferrer"` = 42 characters the
    // editor never sees but the store must fit under the schema limit.
    expect(measured).toBe(raw + 42);
  });

  it("agrees with what the panel would store, for plain content", () => {
    const e = makeEditor("<p>chỉ là chữ</p>");
    expect(sanitizedHtmlLength(e.state.doc)).toBe(stored(e).length);
  });

  it("matches the schema's own ceiling", () => {
    expect(MAX_RICH_TEXT_HTML_LENGTH).toBe(10_000);
  });
});

describe("normalizeLinkHref", () => {
  it("adds https:// to a bare domain", () => {
    expect(normalizeLinkHref("hpwd.vn/thiep")).toBe("https://hpwd.vn/thiep");
  });

  it("leaves an explicit scheme alone", () => {
    expect(normalizeLinkHref("http://hpwd.vn")).toBe("http://hpwd.vn");
    expect(normalizeLinkHref("mailto:a@b.vn")).toBe("mailto:a@b.vn");
  });

  it("keeps a site-relative path relative rather than making it an external host", () => {
    expect(normalizeLinkHref("/dieu-khoan")).toBe("/dieu-khoan");
  });

  it("rejects an unsafe scheme instead of silently prefixing https:// onto it", () => {
    // `javascript:alert(1)` must not become `https://javascript:alert(1)`,
    // and must not come back as-is either.
    expect(normalizeLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkHref("data:text/html,x")).toBeNull();
    expect(normalizeLinkHref("  JAVASCRIPT:alert(1)  ")).toBeNull();
  });

  it("rejects empty and whitespace-only input", () => {
    expect(normalizeLinkHref("")).toBeNull();
    expect(normalizeLinkHref("   ")).toBeNull();
  });

  it("trims surrounding whitespace from a pasted URL", () => {
    expect(normalizeLinkHref("  https://hpwd.vn/x  ")).toBe("https://hpwd.vn/x");
  });
});

describe("acceptsDocChange — the 10.000-character ceiling", () => {
  /** A document whose sanitized html is `length` characters, give or take. */
  function docOfHtmlLength(length: number) {
    const overhead = "<p></p>".length;
    return makeEditor(`<p>${"a".repeat(Math.max(0, length - overhead))}</p>`).state.doc;
  }

  it("accepts a change that stays under the cap", () => {
    const current = docOfHtmlLength(100);
    const next = docOfHtmlLength(200);
    expect(acceptsDocChange(next, current)).toBe(true);
  });

  it("accepts a change that lands exactly on the cap", () => {
    const current = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH - 10);
    const next = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH);
    expect(sanitizedHtmlLength(next)).toBe(MAX_RICH_TEXT_HTML_LENGTH);
    expect(acceptsDocChange(next, current)).toBe(true);
  });

  it("refuses the change that would cross the cap", () => {
    const current = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH);
    const next = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH + 1);
    expect(acceptsDocChange(next, current)).toBe(false);
  });

  it("still lets someone DELETE their way out of an already-oversized document", () => {
    // The trap this carve-out avoids: a document that arrives over the cap
    // (written through the old raw-markup textarea, or grown by the
    // `target`/`rel` sanitizing adds to every link) would otherwise reject
    // every keystroke including backspace, leaving the couple with a
    // section they can neither fix nor save.
    const current = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH + 500);
    const shrunk = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH + 499);

    expect(acceptsDocChange(shrunk, current)).toBe(true);
    // ...but growing it further is still refused.
    const grown = docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH + 501);
    expect(acceptsDocChange(grown, current)).toBe(false);
    // An equal-length change is refused too: it makes no progress.
    expect(acceptsDocChange(docOfHtmlLength(MAX_RICH_TEXT_HTML_LENGTH + 500), current)).toBe(false);
  });

  it("measures the cap against the SANITIZED html, so links count their target/rel", () => {
    // Under the cap by the editor's own reckoning, over it once stored.
    const e = makeEditor(`<p>${"a".repeat(MAX_RICH_TEXT_HTML_LENGTH - 40)}</p>`);
    e.commands.selectAll();
    e.commands.setLink({ href: "https://hpwd.vn/" });

    expect(e.getHTML().length).toBeLessThan(MAX_RICH_TEXT_HTML_LENGTH);
    expect(sanitizedHtmlLength(e.state.doc)).toBeGreaterThan(MAX_RICH_TEXT_HTML_LENGTH);
    expect(acceptsDocChange(e.state.doc, docOfHtmlLength(100))).toBe(false);
  });
});

describe("RichTextLengthGuard — the policy actually reaches ProseMirror", () => {
  it("refuses the transaction and reports it, rather than quietly allowing it", () => {
    // `filterTransaction` is only honoured on a plugin spec. Passing it
    // through `editorProps` type-checks and runs without warning, and does
    // nothing at all — so this test asserts the wiring, not just the rule.
    const onLimit = vi.fn();
    const e = new Editor({
      element: document.createElement("div"),
      extensions: [...RICH_TEXT_EXTENSIONS, RichTextLengthGuard.configure({ onLimit })],
      content: `<p>${"a".repeat(MAX_RICH_TEXT_HTML_LENGTH - 10)}</p>`,
    });
    const before = e.getHTML();

    e.commands.selectAll();
    e.commands.toggleBulletList();

    expect(e.getHTML()).toBe(before);
    expect(onLimit).toHaveBeenCalledWith(true);
    e.destroy();
  });

  it("lets an ordinary edit through and reports that nothing is blocked", () => {
    const onLimit = vi.fn();
    const e = new Editor({
      element: document.createElement("div"),
      extensions: [...RICH_TEXT_EXTENSIONS, RichTextLengthGuard.configure({ onLimit })],
      content: "<p>ngắn</p>",
    });

    e.commands.selectAll();
    e.commands.toggleBulletList();

    expect(e.getHTML()).toContain("<ul>");
    expect(onLimit).toHaveBeenCalledWith(false);
    expect(onLimit).not.toHaveBeenCalledWith(true);
    e.destroy();
  });
});

describe("stripTrailingEmptyParagraph", () => {
  /**
   * StarterKit's trailing-node extension appends an empty paragraph when a
   * document ends in a block that cannot be typed after — a list, a quote,
   * a heading. That paragraph is a necessary ESCAPE HATCH in the editor,
   * but storing it puts a blank line at the bottom of the guest's
   * invitation for a paragraph nobody wrote.
   */
  it("removes the paragraph TipTap appends after a list", () => {
    expect(stripTrailingEmptyParagraph("<ul><li><p>a</p></li></ul><p></p>")).toBe("<ul><li><p>a</p></li></ul>");
  });

  it.each([
    ["<blockquote><p>a</p></blockquote><p></p>", "<blockquote><p>a</p></blockquote>"],
    ["<h2>a</h2><p></p>", "<h2>a</h2>"],
    ["<h3>a</h3><p></p>", "<h3>a</h3>"],
    ["<ol><li><p>a</p></li></ol><p></p>", "<ol><li><p>a</p></li></ol>"],
  ])("removes it after %s too", (input, expected) => {
    expect(stripTrailingEmptyParagraph(input)).toBe(expected);
  });

  it("KEEPS an empty paragraph the couple typed themselves", () => {
    // TipTap never appends a trailing node after a paragraph, so an empty
    // <p> following one is a blank line somebody pressed Enter for.
    // Deleting it would be the editor silently rewriting their spacing.
    expect(stripTrailingEmptyParagraph("<p>a</p><p></p>")).toBe("<p>a</p><p></p>");
  });

  it("keeps an empty document empty rather than producing an empty string", () => {
    // `TextPropsSchema.html` is a plain string, so "" parses — but a
    // document with no <p> at all gives the editor nothing to put a caret
    // in when it is reopened.
    expect(stripTrailingEmptyParagraph("<p></p>")).toBe("<p></p>");
    expect(stripTrailingEmptyParagraph("")).toBe("");
  });

  it("leaves a run of empty paragraphs alone — TipTap cannot have appended any of them", () => {
    // The trailing node is only ever added when the last node is NOT a
    // paragraph. Once one empty <p> is there, every further one came from
    // somebody pressing Enter, so removing any would be rewriting their
    // spacing.
    expect(stripTrailingEmptyParagraph("<h2>a</h2><p></p><p></p>")).toBe("<h2>a</h2><p></p><p></p>");
  });

  it("leaves html that does not end in an empty paragraph untouched", () => {
    for (const html of ["<p>a</p>", "<ul><li><p>a</p></li></ul>", "<p>a</p><p>b</p>", "<h2>a</h2>"]) {
      expect(stripTrailingEmptyParagraph(html)).toBe(html);
    }
  });

  it("is idempotent", () => {
    const once = stripTrailingEmptyParagraph("<ul><li><p>a</p></li></ul><p></p>");
    expect(stripTrailingEmptyParagraph(once)).toBe(once);
  });
});
