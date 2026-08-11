import type { ReactNode } from "react";

/**
 * Layout for public invitation pages. Includes a no-JS fallback for animated
 * sections: framer-motion renders `opacity:0` and animation transforms as
 * inline styles server-side, hiding content if JavaScript fails to load or
 * execute. This noscript block forcibly overrides that to ensure animated
 * content is visible even without JS.
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <noscript>
        <style>{`[data-animate]{opacity:1 !important;transform:none !important;}`}</style>
      </noscript>
      {children}
    </>
  );
}
