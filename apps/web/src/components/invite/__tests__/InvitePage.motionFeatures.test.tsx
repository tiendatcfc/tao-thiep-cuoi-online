// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InvitePage } from "../InvitePage";

/**
 * `InvitePage` is the ONE place that supplies framer-motion's features, via
 * `<LazyMotion features={domAnimation}>`. Every animating component below it
 * — the five opening effects and every `AnimatedSection` — uses the `m`
 * components, which animate only when that provider is above them.
 *
 * Take the provider away and nothing throws. The opening transition simply
 * never runs, so `onAnimationComplete` never fires and the gate opens ~400ms
 * late off `useOpeningTap`'s safety net instead; sections keep the
 * `opacity: 0` their `initial` put there and never fade in. A blank
 * invitation, or a guest waiting behind an overlay, with a green test suite —
 * which is exactly the shape of the blocker that safety net was written for.
 *
 * This file exists so that removal is loud. It forces
 * `prefers-reduced-motion`, which collapses the open transition to duration
 * 0 while leaving the safety net at `animationMs + 400` = 400ms, and then
 * asserts the gate opens far inside that gap. With features, the animation
 * callback opens it in a tick. Without them, only the 400ms timer can.
 */
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

describe("InvitePage supplies framer-motion's features to everything below it", () => {
  it("opens on the animation callback, not on the 400ms safety net", async () => {
    const document = createDefaultDocument();
    document.opening = { effect: "envelope", particles: null, monogram: "M&T", showGuestName: true };

    render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={{ showBadge: false }}
        isPreview={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    // 150ms is comfortably under the safety net's 400ms and comfortably over
    // a duration-0 transition, so the two paths cannot be confused for one
    // another the way a generous timeout would let them.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument(), {
      timeout: 150,
    });
  });
});
