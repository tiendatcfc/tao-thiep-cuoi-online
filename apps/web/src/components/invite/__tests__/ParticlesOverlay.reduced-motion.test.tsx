// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ParticlesOverlay } from "../ParticlesOverlay";

// Separate file for the same module-singleton reason as
// `OpeningGate.reduced-motion.test.tsx` — see the comment there.
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

describe("ParticlesOverlay (prefers-reduced-motion)", () => {
  it("renders no particles at all", () => {
    const { container } = render(<ParticlesOverlay kind="petals" />);
    expect(container.querySelector("canvas")).toBeNull();
  });
});
