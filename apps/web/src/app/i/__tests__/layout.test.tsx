// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InviteLayout from "../layout";

// Task 4: the opening overlay (`OpeningGate`'s envelope/curtain/fade
// variants) only has a working "Mở thiệp" button once JavaScript hydrates,
// so `OpeningGate` no longer SSRs `inert`/`aria-hidden` on the invitation
// content at all (see `OpeningGate.nojs.test.tsx`). Instead the overlay
// itself (`data-opening-overlay`) is what gets hidden for no-JS guests, via
// this noscript stylesheet — the same one that already rescues
// `[data-animate]` opacity for framer-motion's SSR'd inline styles.
describe("app/i/layout.tsx noscript fallback", () => {
  it("ships noscript CSS that hides the opening overlay for no-JS guests", () => {
    const html = renderToString(<InviteLayout>{null}</InviteLayout>);
    expect(html).toContain("[data-opening-overlay]{display:none");
  });
});
