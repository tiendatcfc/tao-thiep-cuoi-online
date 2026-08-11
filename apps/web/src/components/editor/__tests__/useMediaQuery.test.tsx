// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "../useMediaQuery";

// `installFakeMatchMedia` replaces `window.matchMedia` outright (not via
// `vi.spyOn`), so `vi.restoreAllMocks()` in `afterEach` doesn't undo it —
// captured once here so every test starts from the same clean slate instead
// of whatever the previous test's fake left behind.
const originalMatchMedia = window.matchMedia;

/**
 * A minimal but faithful `matchMedia` fake: it actually stores/notifies
 * listeners (unlike jsdom's built-in stub, which always reports
 * `matches: false` and never fires `change`), so `useMediaQuery` can be
 * exercised end to end — initial value AND live updates.
 */
function installFakeMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "",
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

describe("useMediaQuery", () => {
  it("returns the current matchMedia().matches value on mount", () => {
    installFakeMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(true);
  });

  it("returns false on mount when the query doesn't match", () => {
    installFakeMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(false);
  });

  it("updates live when the media query's match state changes", () => {
    const fake = installFakeMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(false);

    act(() => {
      fake.setMatches(true);
    });

    expect(result.current).toBe(true);
  });

  it("stops listening after unmount", () => {
    const fake = installFakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    unmount();

    act(() => {
      fake.setMatches(true);
    });

    // No listener left to update state; the hook's last known value (from
    // before unmount) is untouched. Mainly guards against a leaked listener
    // throwing on a future `setMatches` call after teardown.
    expect(result.current).toBe(false);
  });

  describe("hydration safety", () => {
    /**
     * `EditorLayout` renders as a plain "use client" component with no
     * `dynamic(..., { ssr: false })` opt-out, so its first client render IS
     * the hydration render — not a fresh client-only mount. If that first
     * render read the real `matchMedia` value, it could disagree with
     * whatever the server rendered (which never has a real `matchMedia` at
     * all), and React would discard + remount the subtree to reconcile the
     * mismatch. `PreviewPane`'s `InvitePage` tree carries real side effects
     * (audio element, opening timers) that must not be torn down and
     * recreated by an avoidable hydration mismatch.
     */
    it("returns false synchronously on the very first (pre-effect) render, even when matchMedia already reports a match", async () => {
      installFakeMatchMedia(true);
      function Probe() {
        return <span data-testid="probe">{String(useMediaQuery("(min-width: 1024px)"))}</span>;
      }

      const container = document.createElement("div");
      document.body.appendChild(container);
      // `flushSync` forces the render+commit to happen synchronously (so the
      // DOM is observable immediately below) without also flushing passive
      // effects — unlike `act()`, which flushes both and would hide exactly
      // the pre-effect render this test needs to see. The resulting "not
      // wrapped in act" warning (since the *effect's* later state update
      // still happens outside `act()`) is expected and suppressed.
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const root = createRoot(container);
      try {
        flushSync(() => {
          root.render(<Probe />);
        });

        expect(container.querySelector('[data-testid="probe"]')?.textContent).toBe("false");

        await act(async () => {}); // flush the effect
        expect(container.querySelector('[data-testid="probe"]')?.textContent).toBe("true");
      } finally {
        root.unmount();
        container.remove();
        consoleError.mockRestore();
      }
    });

    it("hydrates cleanly with no mismatch warning, then adopts the real matchMedia value once effects flush", async () => {
      function Probe() {
        const matches = useMediaQuery("(min-width: 1024px)");
        return <div data-testid="probe">{matches ? "desktop" : "mobile"}</div>;
      }

      // A real server render never touches `matchMedia` at all. Explicitly
      // faking "false" here rather than relying on whatever `matchMedia`
      // happens to already be (jsdom's own default always reports `false`
      // too, but leaving this implicit would make the test pass by
      // accident rather than by construction).
      installFakeMatchMedia(false);
      const html = renderToString(<Probe />);
      expect(html).toContain("mobile");

      // The client's real environment reports a match — the exact
      // mismatch scenario the server couldn't have known about.
      installFakeMatchMedia(true);

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await act(async () => {
          hydrateRoot(container, <Probe />);
        });

        const hydrationWarning = consoleError.mock.calls.some(([message]) =>
          typeof message === "string" && /hydrat/i.test(message),
        );
        expect(hydrationWarning).toBe(false);
        expect(container.querySelector('[data-testid="probe"]')?.textContent).toBe("desktop");
      } finally {
        consoleError.mockRestore();
        container.remove();
      }
    });
  });
});
