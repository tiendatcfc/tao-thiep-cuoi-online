// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { CustomFontStyle } from "../CustomFontStyle";

afterEach(cleanup);

function css(container: HTMLElement): string {
  return container.querySelector("style")?.textContent ?? "";
}

describe("CustomFontStyle", () => {
  it("emits one @font-face rule per uploaded font", () => {
    const { container } = render(
      <CustomFontStyle
        fonts={[
          { family: "Noto Sans", url: "https://cdn.test/u/1/a.woff2" },
          { family: "Chữ Đẹp Việt", url: "https://cdn.test/u/1/b.woff2" },
        ]}
      />,
    );

    const rules = css(container);
    expect(rules).toContain('font-family: "Noto Sans"');
    expect(rules).toContain('url("https://cdn.test/u/1/a.woff2")');
    expect(rules).toContain('font-family: "Chữ Đẹp Việt"');
    expect(rules.match(/@font-face/g)).toHaveLength(2);
  });

  it("declares woff2 format and swap display, so text is readable while the font loads", () => {
    const { container } = render(
      <CustomFontStyle fonts={[{ family: "Noto Sans", url: "https://cdn.test/a.woff2" }]} />,
    );

    expect(css(container)).toContain('format("woff2")');
    expect(css(container)).toContain("font-display: swap");
  });

  it("renders nothing at all when there are no custom fonts", () => {
    const { container } = render(<CustomFontStyle fonts={[]} />);

    expect(container.querySelector("style")).toBeNull();
  });
});

describe("CustomFontStyle — re-sanitizes at render, because the document is writable", () => {
  /**
   * `theme.customFonts` reaches this component straight out of the stored
   * invitation document, and that document can be rewritten wholesale
   * through `PATCH /api/invitations/[id]`. The upload route's sanitizing
   * is therefore not the last line of defence — this is, exactly as
   * `TextSection` sanitizes HTML a second time at render.
   */
  it("neutralises a family name that tries to close the rule", () => {
    const { container } = render(
      <CustomFontStyle
        fonts={[{ family: 'Evil"; } body { display: none } @font-face { font-family: "X', url: "https://cdn.test/a.woff2" }]}
      />,
    );

    // Asserted as the whole emitted rule, not by substring: the sanitizer
    // keeps LETTERS and removes only the structural characters, so the
    // leftover words stay — harmlessly, inside the quoted family name. A
    // `not.toContain("display")` check would be asserting a behaviour this
    // deliberately does not have, and would pass for the wrong reason.
    expect(css(container)).toBe(
      '@font-face { font-family: "Evil body display none font-face font-family X"; ' +
        'src: url("https://cdn.test/a.woff2") format("woff2"); font-display: swap; }',
    );
    expect(css(container).match(/\{/g)).toHaveLength(1);
  });

  it("drops a font whose url tries to escape the url() token", () => {
    const { container } = render(
      <CustomFontStyle
        fonts={[
          { family: "Bad", url: 'https://cdn.test/a.woff2"); } body { display: none } .x { content: url("' },
          { family: "Good", url: "https://cdn.test/b.woff2" },
        ]}
      />,
    );

    const rules = css(container);
    expect(rules).not.toContain("display: none");
    expect(rules).not.toContain("Bad");
    // The valid entry beside it still renders: one bad font must not blank
    // the couple's whole typography.
    expect(rules).toContain('font-family: "Good"');
    expect(rules.match(/@font-face/g)).toHaveLength(1);
  });

  it("drops a data: url, which would smuggle a whole font into the document", () => {
    const { container } = render(
      <CustomFontStyle fonts={[{ family: "Sneaky", url: "data:font/woff2;base64,AAAA" }]} />,
    );

    expect(container.querySelector("style")).toBeNull();
  });

  it("drops an entry whose family sanitizes away to nothing", () => {
    const { container } = render(<CustomFontStyle fonts={[{ family: '{};"', url: "https://cdn.test/a.woff2" }]} />);

    expect(container.querySelector("style")).toBeNull();
  });

  it("keeps a query string intact rather than HTML-escaping the ampersand", () => {
    // Rendered through `dangerouslySetInnerHTML`: passing the CSS as a text
    // child would have React escape `&` to `&amp;` inside <style>, which
    // silently breaks any signed or versioned font URL.
    const { container } = render(
      <CustomFontStyle fonts={[{ family: "Noto Sans", url: "https://cdn.test/a.woff2?v=2&sig=abc" }]} />,
    );

    expect(css(container)).toContain('url("https://cdn.test/a.woff2?v=2&sig=abc")');
    expect(css(container)).not.toContain("&amp;");
  });
});
