// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteContext } from "../../InviteContext";
import { OpeningGate } from "../OpeningGate";

// Task 4: a guest with JavaScript disabled has no way to click the overlay's
// "Mở thiệp" button (its handler never attaches without hydration), so if the
// server-rendered HTML ever carries `inert`/`aria-hidden` on the content, that
// guest is permanently trapped behind the (JS-only) opening overlay — `inert`
// is a real HTML attribute, no `<noscript>` stylesheet can strip it. This
// suite pins both halves of the fix: SSR markup must NOT gate the content at
// all (only mark the overlay so `app/i/layout.tsx`'s noscript CSS can hide
// it), while a JS-enabled guest still gets the content properly hidden from
// assistive tech and interaction once React hydrates.
function gate(effect: "envelope" | "curtain" | "fade") {
  const opening = { ...createDefaultDocument().opening, effect };
  return (
    <InviteContext.Provider value={{ guestName: null, showGuestName: true, isPreview: false, slug: null }}>
      <OpeningGate opening={opening} guestName={null} onOpened={() => {}}>
        <p>NỘI DUNG THIỆP</p>
      </OpeningGate>
    </InviteContext.Provider>
  );
}

describe("OpeningGate without JavaScript (SSR markup only)", () => {
  it.each(["envelope", "curtain", "fade"] as const)(
    "SSR HTML for effect=%s carries neither inert nor aria-hidden on the content, and marks the overlay for the noscript CSS",
    (effect) => {
      const html = renderToString(gate(effect));
      expect(html).toContain("data-opening-overlay");
      // `inert` must not appear ANYWHERE in the server-rendered markup:
      // it is the attribute a no-JS guest can never get rid of, and the
      // overlay carrying it would be just as fatal as the content doing so.
      expect(html).not.toContain("inert");

      // `aria-hidden`, by contrast, is checked against the CONTENT
      // WRAPPER and its subtree specifically, not against the whole
      // document. The overlay legitimately marks its own decorations
      // (paper grain, the envelope flap, the seal's halo, the ornament)
      // `aria-hidden="true"` — they are pure ornament and a screen reader
      // should skip them. What must never be hidden is the invitation.
      const content = new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector("[data-opening-content]");
      expect(content).not.toBeNull();
      expect(content?.textContent).toContain("NỘI DUNG THIỆP");
      expect(content?.getAttribute("aria-hidden")).toBeNull();
      expect(content?.querySelector('[aria-hidden="true"]')).toBeNull();
    },
  );
});

describe("OpeningGate with JavaScript (after hydration)", () => {
  it("re-applies inert + aria-hidden to the content once mounted, while still closed", () => {
    const { container } = render(gate("fade"));
    const wrapper = container.querySelector("[data-opening-content]");
    expect(wrapper?.hasAttribute("inert")).toBe(true);
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });
});
