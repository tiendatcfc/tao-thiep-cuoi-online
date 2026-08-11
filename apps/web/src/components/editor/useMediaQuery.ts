"use client";

import { useEffect, useState } from "react";

/**
 * Hydration-safe `matchMedia` hook. Always starts at `false` — including on
 * the client's very first render — then syncs to the real value (and live
 * updates) from inside `useEffect`, which only runs post-hydration.
 *
 * `EditorLayout` is a plain "use client" component with no
 * `dynamic(..., { ssr: false })` opt-out, so its first client render IS the
 * hydration render, not a fresh client-only mount. Reading the real
 * `matchMedia` value during that first render (e.g. via a `useState` lazy
 * initializer guarded only by `typeof window === "undefined"`) would work
 * for a plain client-only mount, but not for hydration: the guard is
 * already false by then, so the first render could disagree with whatever
 * the server rendered (which never had a real `matchMedia` to read), and
 * React would discard and remount the whole subtree to reconcile the
 * mismatch — which would mount `PreviewPane`'s `InvitePage` tree (audio
 * element, opening-animation timers) twice in the process, the exact
 * doubled-side-effect risk this hook exists to prevent. Starting at a fixed
 * `false` unconditionally means the first client render always matches the
 * (also-always-`false`) server render; the one-frame flash to the real
 * value once the effect runs is the accepted trade-off.
 *
 * Used by `EditorLayout` to pick exactly one of the desktop three-pane grid
 * or the mobile tab layout to render — CSS `hidden`/`lg:hidden` on two
 * always-mounted trees was mounting `PreviewPane` twice at all times
 * regardless of viewport, which is the problem this hook was introduced to
 * solve in the first place.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

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
