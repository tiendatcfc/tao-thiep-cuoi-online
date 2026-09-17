// @vitest-environment jsdom
import type { Opening } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { OpeningGate } from "../opening/OpeningGate";

// Own file for the same reason as `OpeningGate.reduced-motion.test.tsx`:
// framer-motion reads `window.matchMedia` once per module instance and
// caches it in a module-level singleton, so the stub has to be installed
// before anything in this registry renders.
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

function openingDoc(effect: Opening["effect"]): Opening {
  return { effect, particles: null, monogram: "M&T", showGuestName: true };
}

describe("new opening effects (prefers-reduced-motion)", () => {
  it.each(["reveal", "petals"] as const)("opens %s near-instantly rather than animating", async (effect) => {
    const onOpened = vi.fn();
    render(
      <InviteContext.Provider value={{ guestName: "An", showGuestName: true, isPreview: false, slug: null }}>
        <OpeningGate opening={openingDoc(effect)} guestName="An" onOpened={onOpened}>
          <div>Nội dung thiệp</div>
        </OpeningGate>
      </InviteContext.Provider>,
    );

    const startedAt = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 1000 });
    // The safety net alone would take animationMs + 400 = 1.1s+; resolving
    // well inside that proves the reduced-motion path really collapsed the
    // durations rather than just eventually timing out.
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument();
  });
});
