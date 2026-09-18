// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_RICH_TEXT_HTML_LENGTH } from "../rich-text";
import { RichTextEditor } from "../RichTextEditor";

afterEach(cleanup);

/**
 * Wiring-level tests for the panel shell. The TipTap-to-sanitizer contract
 * itself lives in `rich-text.test.ts`, which drives a real editor directly;
 * what is asserted here is that the toolbar, the link box, the debounce and
 * the length guard are actually connected to it.
 */
function setup(value = "<p>xin chào</p>") {
  const onChange = vi.fn();
  render(<RichTextEditor label="Nội dung" value={value} onChange={onChange} />);
  return { onChange };
}

/** The store only hears about an edit after `useDebouncedField`'s 250ms. */
function lastPushed(onChange: ReturnType<typeof vi.fn>): Promise<string> {
  return waitFor(() => {
    expect(onChange).toHaveBeenCalled();
    return onChange.mock.calls.at(-1)![0] as string;
  });
}

describe("RichTextEditor — the editing surface", () => {
  it("exposes a labelled multi-line textbox and a named toolbar", () => {
    setup();

    const textbox = screen.getByRole("textbox", { name: "Nội dung" });
    expect(textbox).toHaveAttribute("aria-multiline", "true");
    expect(textbox).toHaveAttribute("contenteditable", "true");
    expect(screen.getByRole("toolbar", { name: "Định dạng văn bản" })).toBeInTheDocument();
  });

  it("offers every formatting control the task promises, in Vietnamese", () => {
    setup();

    for (const label of [
      "Đậm",
      "Nghiêng",
      "Gạch chân",
      "Gạch ngang",
      "Tiêu đề",
      "Tiêu đề phụ",
      "Danh sách",
      "Danh sách đánh số",
      "Trích dẫn",
      "Liên kết",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the document it was given, rather than starting empty", () => {
    setup("<h2>Chương trình</h2><ul><li><p>Đón khách</p></li></ul>");

    const textbox = screen.getByRole("textbox", { name: "Nội dung" });
    expect(textbox.querySelector("h2")?.textContent).toBe("Chương trình");
    expect(textbox.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("RichTextEditor — what reaches the store", () => {
  it("pushes SANITIZED html after the debounce when a toolbar button is used", async () => {
    const { onChange } = setup("<p>xin chào</p>");

    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Danh sách" }));

    // No trailing `<p></p>`: StarterKit appends one after a list so the
    // couple can type below it, but it is stripped on the way to the store
    // — stored, it renders as a blank line at the bottom of the guest's
    // invitation for a paragraph nobody wrote. The editor puts it straight
    // back the next time the document is opened.
    await expect(lastPushed(onChange)).resolves.toBe("<ul><li><p>xin chào</p></li></ul>");
  });

  it("reflects the caret's formatting back through aria-pressed", async () => {
    setup("<p>xin chào</p>");
    const quote = screen.getByRole("button", { name: "Trích dẫn" });
    expect(quote).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(quote);

    await waitFor(() => expect(quote).toHaveAttribute("aria-pressed", "true"));
  });

  it("never lets hostile markup in the stored value survive a round trip", async () => {
    // A document written before this editor existed — the raw-markup
    // textarea let the couple type anything, and sanitizing only happened
    // at render time.
    const { onChange } = setup('<p>giữ</p><p>&lt;img src=x onerror=alert(1)&gt;</p>');

    fireEvent.click(screen.getByRole("button", { name: "Danh sách" }));

    const pushed = await lastPushed(onChange);
    expect(pushed).toContain("giữ");
    expect(pushed).not.toContain("<img");
    expect(pushed).not.toMatch(/<[^>]*onerror/);
  });

  it("keeps a link written by a previous session intact when the text is edited", async () => {
    // The regression that makes `BareLink` necessary: stock TipTap
    // re-renders the sanitizer's own `target`/`rel` ahead of `href`, and
    // the next save escapes the whole anchor into visible text.
    const saved = '<p><a href="https://hpwd.vn/x" target="_blank" rel="noopener noreferrer">liên kết</a></p>';
    const { onChange } = setup(saved);

    fireEvent.click(screen.getByRole("button", { name: "Trích dẫn" }));

    const pushed = await lastPushed(onChange);
    expect(pushed).toBe(`<blockquote>${saved}</blockquote>`);
  });
});

describe("RichTextEditor — the link box", () => {
  function openLinkBox() {
    fireEvent.click(screen.getByRole("button", { name: "Liên kết" }));
    return screen.getByLabelText("Đường dẫn liên kết");
  }

  it("normalises a bare domain into an https link", async () => {
    const { onChange } = setup("<p>xin chào</p>");

    fireEvent.change(openLinkBox(), { target: { value: "hpwd.vn/thiep" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));

    const pushed = await lastPushed(onChange);
    expect(pushed).toContain('href="https://hpwd.vn/thiep"');
    expect(pushed).toContain('rel="noopener noreferrer"');
  });

  it("refuses a javascript: URL with a message, and writes no anchor at all", async () => {
    const { onChange } = setup("<p>xin chào</p>");

    fireEvent.change(openLinkBox(), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/không hợp lệ/i);
    // The box stays open so the typo can be corrected in place.
    expect(screen.getByLabelText("Đường dẫn liên kết")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Nội dung" }).querySelector("a")).toBeNull();
  });

  it("removes an existing link on request", async () => {
    const { onChange } = setup(
      '<p><a href="https://hpwd.vn/x" target="_blank" rel="noopener noreferrer">liên kết</a></p>',
    );

    openLinkBox();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ liên kết" }));

    const pushed = await lastPushed(onChange);
    expect(pushed).toBe("<p>liên kết</p>");
  });
});

describe("RichTextEditor — the 10.000-character ceiling", () => {
  it("refuses the change that would cross it, and says so", async () => {
    // `<p>` + `</p>` is 7 characters, so this document sits 3 under the
    // cap; wrapping it in a list would add 18 more.
    const { onChange } = setup(`<p>${"a".repeat(MAX_RICH_TEXT_HTML_LENGTH - 10)}</p>`);

    fireEvent.click(screen.getByRole("button", { name: "Danh sách" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/giới hạn/i);
    expect(screen.getByRole("textbox", { name: "Nội dung" }).querySelector("ul")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays quiet while there is room left", () => {
    setup("<p>ngắn</p>");
    fireEvent.click(screen.getByRole("button", { name: "Danh sách" }));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
