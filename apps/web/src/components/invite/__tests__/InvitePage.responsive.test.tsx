// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InvitePage } from "../InvitePage";

afterEach(cleanup);

function renderInvitation(isPreview: boolean) {
  return render(
    <InvitePage
      document={createDefaultDocument()}
      guestName={null}
      settings={{ showBadge: true }}
      isPreview={isPreview}
      slug={isPreview ? null : "demo"}
    />,
  );
}

/**
 * The invitation is rendered at three very different sizes — a phone, a
 * tablet, a laptop, and a 390x780 box inside the editor — and two of the
 * bugs this guards against were invisible on the machine they were written
 * on, because the developer's browser window happened to be the size that
 * made them look right.
 *
 * jsdom applies no stylesheet, so these assert the CLASSES and ATTRIBUTES
 * that select the behaviour, not computed pixels. That is the level the
 * bugs actually lived at: one wrong unit, one attribute in the wrong
 * branch.
 */
describe("InvitePage across viewports", () => {
  it('measures "one screenful" with --viewport-h, never the browser window', () => {
    // `100dvh` is the browser window even when the invitation is rendered
    // inside the editor's 780px phone frame, which made the cover section
    // taller than the box containing it and left the couple previewing
    // half a screen of blank paper. Everything that means "one screenful"
    // has to go through the variable that `PreviewPane` can override.
    const { container } = renderInvitation(false);

    const column = container.querySelector("[data-invite-column]");
    const cover = container.querySelector('[data-section="cover"]');

    for (const el of [column, cover]) {
      expect(el).not.toBeNull();
      expect(el?.className).toContain("min-h-[var(--viewport-h)]");
      expect(el?.className).not.toContain("min-h-dvh");
    }
  });

  it("wraps the column in a stage, so wide screens are not a 430px stripe on a bare page", () => {
    const { container } = renderInvitation(false);

    const stage = container.querySelector("[data-invite-stage]");
    expect(stage).not.toBeNull();
    // The theme variables have to live on the STAGE, not on the column:
    // the stage mixes its wash out of the couple's own `--secondary`, and
    // a variable defined on a child is not visible to its parent.
    expect((stage as HTMLElement).style.getPropertyValue("--secondary")).not.toBe("");
    expect(stage?.querySelector("[data-invite-column]")).not.toBeNull();
  });

  it("does NOT stage the editor preview, which is a phone rendered inside a wide window", () => {
    // The stage turns on with a viewport media query, and inside the
    // editor that query answers for the browser window rather than for the
    // 390px frame — so the preview would show desktop chrome around a
    // phone-width invitation and quietly lie about what a guest will see.
    // A container query, which would answer honestly, cannot be used here:
    // `container-type` makes the element a containing block for
    // `position: fixed` descendants, which would re-anchor the opening
    // overlay from the viewport to the full-height document.
    const { container } = renderInvitation(true);

    expect(container.querySelector("[data-invite-column]")).not.toBeNull();
    expect(container.querySelector("[data-invite-stage]")).toBeNull();
  });

  it("lets the opening gate scroll, so nothing is unreachable on a short screen", () => {
    // Measured on a phone held sideways (844x390): the gate's composition
    // came to 614px and a `justify-center` flex container clipped it at
    // BOTH ends — the seal above the fold and the "Mở thiệp" button below
    // it, with no way to scroll to either. Centring has to happen on a
    // `min-h-full` child of a scrollable box, never on the fixed box
    // itself, or the overflow goes in both directions and the top half
    // cannot be reached at all.
    const { container } = renderInvitation(false);

    const gate = container.querySelector("[data-opening-gate]");
    expect(gate).not.toBeNull();
    expect(gate?.className).toContain("overflow-y-auto");
    expect(gate?.className).not.toContain("justify-center");

    const centred = gate?.querySelector(".min-h-full");
    expect(centred).not.toBeNull();
    expect(centred?.className).toContain("justify-center");
  });

  it("keeps the theme variables and the font hook on the same element the stage styles", () => {
    const { container } = renderInvitation(false);

    const root = container.querySelector("[data-invite-root]");
    expect(root).not.toBeNull();
    // `fonts.css` styles `[data-invite-root]` and its headings; the stage
    // rules in globals.css style `[data-invite-stage]`. They must be the
    // same element, or one of the two silently stops applying.
    expect(root?.hasAttribute("data-invite-stage")).toBe(true);
  });
});
