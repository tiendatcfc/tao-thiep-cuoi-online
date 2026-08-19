import type { ReactNode } from "react";

/**
 * Layout for public invitation pages. Ships a no-JS fallback that rescues
 * TWO independent mechanisms which would otherwise misbehave without
 * JavaScript:
 *
 * 1. Animated sections: framer-motion renders `opacity:0` and animation
 *    transforms as inline styles server-side, hiding content if JavaScript
 *    fails to load or execute. `[data-animate]` forcibly overrides that so
 *    animated content is visible even without JS.
 * 2. The opening overlay (Task 4): `OpeningGate` no longer SSRs
 *    `inert`/`aria-hidden` on the invitation content (that's a real HTML
 *    attribute no stylesheet can remove, and would permanently trap a no-JS
 *    guest behind a "Mở thiệp" button whose click handler never attaches).
 *    Instead, the content renders un-gated and it's the — now
 *    non-functional — overlay itself (`[data-opening-overlay]`) that gets
 *    hidden here, so the underlying content is visible and scrollable.
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <noscript>
        <style>{`[data-animate]{opacity:1 !important;transform:none !important;}[data-opening-overlay]{display:none !important;}`}</style>
      </noscript>
      {children}
    </>
  );
}
