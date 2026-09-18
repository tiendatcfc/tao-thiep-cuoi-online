import type { ReactNode } from "react";
import { storageOriginFromEnv } from "@/lib/csp";

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
 *
 * It also preconnects to the object store. Every photo, and the music, come
 * from a different origin than the page, so the first request there pays for
 * a DNS lookup plus a TCP and TLS handshake before a single byte moves — on
 * the cover photo, which is the LCP element whenever a couple sets one. The
 * origin is read from the environment, the same source the CSP uses, so it
 * cannot name a host the policy would then block.
 *
 * NOT MEASURED HERE, and deliberately kept anyway. On this machine the store
 * is MinIO on loopback with no DNS and no TLS, so there is nothing for a
 * preconnect to save and the traces show no difference. The saving is two to
 * three round trips against a real CDN over mobile, which is a mechanism
 * rather than a guess; the magnitude is what cannot be measured locally.
 *
 * Two other candidates WERE measured and removed because they changed
 * nothing: `fetchPriority="high"` on the cover `<img>`, and a
 * `<link rel="preload" as="image">` for it (1,223 ms before, 1,238 ms and
 * 1,235 ms after — noise). The cover image is not requested late because it
 * is discovered late: the preload sat at byte 135, ahead of the stylesheet,
 * and the request still went out at the same moment. It is late because the
 * 124 kB HTML document saturates a throttled connection until ~600 ms.
 * Shrinking that payload is the next real lever; priority hints are not.
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  const storageOrigin = storageOriginFromEnv();
  return (
    <>
      {storageOrigin ? (
        <>
          <link rel="preconnect" href={storageOrigin} />
          <link rel="dns-prefetch" href={storageOrigin} />
        </>
      ) : null}
      <noscript>
        <style>{`[data-animate]{opacity:1 !important;transform:none !important;}[data-opening-overlay]{display:none !important;}`}</style>
      </noscript>
      {children}
    </>
  );
}
