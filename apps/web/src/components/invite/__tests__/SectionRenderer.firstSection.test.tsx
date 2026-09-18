// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvitePage } from "../InvitePage";

const settings = { showBadge: true };

/**
 * The first visible section is above the fold by definition, so animating it
 * INTO view is a contradiction: framer-motion writes the `initial` state
 * (`opacity: 0`) straight into the server-rendered HTML, and the section
 * stays invisible until the bundle has downloaded, parsed and hydrated.
 *
 * Measured on a production build at Slow 4G with 4x CPU throttling before
 * this change: LCP 1,477 ms, of which 1,437 ms — 97% — was render delay
 * waiting for exactly that. The element Chrome picked was the couple's names,
 * which are in the server-rendered HTML from the first byte.
 */
describe("SectionRenderer: the first visible section paints without waiting for JavaScript", () => {
  it("renders the first section with no animation wrapper", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const cover = container.querySelector('[data-section="cover"]');
    expect(cover).not.toBeNull();
    expect(cover?.closest("[data-animate]")).toBeNull();
  });

  it("still animates the sections below it", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    expect(container.querySelectorAll("[data-animate]").length).toBeGreaterThan(0);
  });

  // "First" means first in the couple's order, not "the cover": sections are
  // reorderable and the cover can be hidden, so keying off the type would
  // leave whatever they actually put first invisible until hydration.
  it("follows the couple's order rather than assuming the cover is first", () => {
    const document = createDefaultDocument();
    const cover = document.sections.find((s) => s.type === "cover");
    const couple = document.sections.find((s) => s.type === "couple");
    if (!cover || !couple) throw new Error("fixture missing sections");
    cover.visible = false;

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const first = container.querySelector(`[data-section="${couple.type}"]`);
    expect(first).not.toBeNull();
    expect(first?.closest("[data-animate]")).toBeNull();
  });

  // The whole point is what reaches the browser before any JavaScript runs.
  it("puts no opacity:0 on the first section in the rendered markup", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const cover = container.querySelector('[data-section="cover"]');
    const styles: string[] = [];
    for (let node = cover as HTMLElement | null; node; node = node.parentElement) {
      const style = node.getAttribute("style");
      if (style) styles.push(style);
    }
    expect(styles.join(";")).not.toContain("opacity: 0");
  });
});
