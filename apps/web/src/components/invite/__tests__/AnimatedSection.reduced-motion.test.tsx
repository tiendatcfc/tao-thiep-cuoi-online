// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AnimatedSection } from "../AnimatedSection";

// Kept in its own file on purpose: framer-motion's `useReducedMotion()`
// lazily reads `window.matchMedia` exactly once per module instance (via a
// module-level singleton in `motion-dom`) and never re-checks afterwards.
// Vitest gives each test *file* a fresh module registry, so stubbing
// `matchMedia` here — before anything renders — reliably forces the
// reduced-motion branch for every test in this file without leaking into
// (or being clobbered by) `AnimatedSection.test.tsx`, which deliberately
// tests the real, non-reduced-motion animation path instead. See
// `OpeningGate.reduced-motion.test.tsx` / `ParticlesOverlay.reduced-motion.test.tsx`
// for the same pattern applied to other framer-motion consumers.
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

describe("AnimatedSection (prefers-reduced-motion)", () => {
  it("renders children with no motion wrapper for a non-'none' preset", () => {
    const { container } = render(
      <AnimatedSection animation={{ preset: "fade", durationMs: 800 }}>
        <div data-testid="child">Content</div>
      </AnimatedSection>,
    );

    // Content is still rendered...
    expect(container.querySelector('[data-testid="child"]')).toBeInTheDocument();
    // ...but with no `motion.div` wrapper, since prefers-reduced-motion
    // short-circuits the animated branch regardless of `animation.preset`.
    expect(container.querySelector("[data-animate]")).not.toBeInTheDocument();
  });
});
