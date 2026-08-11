"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe `matchMedia` hook. Defaults to `false` when there's no `window`
 * (Next.js still server-renders client components once for the initial
 * HTML) or no `matchMedia` support, then syncs to the real value and live
 * updates once mounted in the browser.
 *
 * Used by `EditorLayout` to pick exactly one of the desktop three-pane grid
 * or the mobile tab layout to render — CSS `hidden`/`lg:hidden` on two
 * always-mounted trees was mounting `PreviewPane` (and the real `InvitePage`
 * inside it) twice at all times, doubling up its side effects.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
