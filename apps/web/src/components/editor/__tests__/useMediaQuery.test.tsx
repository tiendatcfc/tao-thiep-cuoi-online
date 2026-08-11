// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "../useMediaQuery";

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
});
