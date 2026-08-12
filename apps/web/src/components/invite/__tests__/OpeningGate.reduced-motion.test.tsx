// @vitest-environment jsdom
import type { Opening } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { OpeningGate } from "../opening/OpeningGate";

// Kept in its own file on purpose: framer-motion's `useReducedMotion()`
// lazily reads `window.matchMedia` exactly once per module instance (via a
// module-level singleton in `motion-dom`) and never re-checks afterwards.
// Vitest gives each test *file* a fresh module registry, so stubbing
// `matchMedia` here — before anything renders — reliably forces the
// reduced-motion branch for every test in this file without leaking into
// (or being clobbered by) `OpeningGate.test.tsx`, which deliberately tests
// the real, non-reduced-motion animation path instead.
beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const openingDoc: Opening = {
  effect: "envelope",
  particles: "petals",
  monogram: "M&T",
  showGuestName: true,
};

describe("OpeningGate (prefers-reduced-motion)", () => {
  it("skips the animation and opens near-instantly on tap, still calling onOpened", async () => {
    const onOpened = vi.fn();
    render(
      <InviteContext.Provider value={{ guestName: "An", showGuestName: true, isPreview: false, slug: null }}>
        <OpeningGate opening={openingDoc} guestName="An" onOpened={onOpened}>
          <div>Nội dung thiệp</div>
        </OpeningGate>
      </InviteContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    // "Near-instantly": a much tighter timeout than the real-motion suite
    // uses, since every transition collapses to duration 0 under reduced
    // motion.
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 200 });
  });
});
