// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InvitePage } from "../InvitePage";

// The whole point of Task 13: the guest's tap on the opening overlay is the
// browser-required user-gesture that unlocks `MusicPlayer`'s autoplay. This
// suite proves that end-to-end, from a real `InvitePage` render down to
// `audio.play()`.
//
// It forces `prefers-reduced-motion` (see the comment in
// `OpeningGate.reduced-motion.test.tsx` for why this needs its own file) so
// the tap-to-open animation collapses to duration 0. That's a deliberate
// choice to keep this test about the *wiring* — gesture unlocks audio —
// rather than re-proving the opening animation itself, which
// `OpeningGate.test.tsx` already exercises against real, non-reduced
// framer-motion timing.
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

describe("InvitePage / opening gate -> MusicPlayer integration", () => {
  let playSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.play = playSpy as unknown as HTMLMediaElement["play"];
    window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
  });

  // C1 fix: this used to need a `waitFor` here — `play()` only fired ~1s
  // later, via `onAnimationComplete`/the safety net, two-plus React commits
  // past the actual click. Strict WebKit (iOS Safari/WebViews) only honors
  // `play()` as user-gesture-triggered while still inside the SAME call
  // stack as the gesture event; by the time the old code called it, that
  // window had already closed, so music silently never started on iOS.
  // Asserting synchronously (no `await`/`waitFor` between the click and
  // this assertion) is the actual, load-bearing proof.
  it("never calls play() before the tap, and calls it SYNCHRONOUSLY on the tap itself (not via a later animation callback)", () => {
    const document = createDefaultDocument();
    document.opening = { effect: "envelope", particles: "petals", monogram: "M&T", showGuestName: true };
    document.music = { source: "upload", url: "https://cdn.test/song.mp3", trackId: null, assetId: null, playAfterOpen: true };

    render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={{ showBadge: false }}
        isPreview={false}
      />,
    );

    expect(playSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("respects music.playAfterOpen: false — the tap opens the invitation but never auto-starts audio", async () => {
    const document = createDefaultDocument();
    document.opening = { effect: "envelope", particles: "petals", monogram: "M&T", showGuestName: true };
    document.music = { source: "upload", url: "https://cdn.test/song.mp3", trackId: null, assetId: null, playAfterOpen: false };

    render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={{ showBadge: false }}
        isPreview={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    // Give the (near-instant, reduced-motion) open animation a tick to
    // finish, then assert play() was still never auto-triggered — only
    // `document.opening`'s tap unlocked the gate, `music.playAfterOpen`
    // decides whether that also starts audio.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument());
    expect(playSpy).not.toHaveBeenCalled();

    // The player itself is still fully usable via its own toggle button —
    // `findByRole` (not `getByRole`) because the button only becomes
    // interactive (C7) once `InvitePage`'s own `opened` state cascades
    // through, a render pass behind `OpeningGate`'s own internal state
    // flip this test already waited for above.
    fireEvent.click(await screen.findByRole("button", { name: "Bật nhạc" }));
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  // C7: MusicPlayer's button is `fixed`/`z-50`, rendered as a sibling of
  // `OpeningGate` (never inside its `inert` wrapper) — without gating it on
  // `opened`, it sat visually ABOVE the (z-30) opening overlay and stayed
  // fully tappable/focusable even before the guest had opened anything.
  it("hides/disables the music toggle button until the gate is opened, then makes it usable", async () => {
    const document = createDefaultDocument();
    document.opening = { effect: "envelope", particles: "petals", monogram: "M&T", showGuestName: true };
    document.music = { source: "upload", url: "https://cdn.test/song.mp3", trackId: null, assetId: null, playAfterOpen: false };

    const { container } = render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={{ showBadge: false }}
        isPreview={false}
      />,
    );

    // Not exposed to assistive tech, not focusable, and clicking it must
    // not start playback while the gate is still closed — the button
    // exists in the DOM (kept mounted per MusicPlayer's own contract) but
    // is fully withdrawn from interaction. Queried directly by attribute
    // (not `getByRole`'s name matching) because `aria-hidden="true"` makes
    // the accessible-name computation itself come back empty, which is
    // exactly the "removed from the a11y tree" behavior being asserted.
    const buttonBeforeOpen = container.querySelector('button[aria-label="Bật nhạc"]');
    expect(buttonBeforeOpen).not.toBeNull();
    if (!buttonBeforeOpen) throw new Error("unreachable");
    expect(buttonBeforeOpen).toHaveAttribute("aria-hidden", "true");
    expect(buttonBeforeOpen).toHaveAttribute("tabindex", "-1");
    expect(buttonBeforeOpen).toBeDisabled();
    fireEvent.click(buttonBeforeOpen);
    expect(playSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument());

    const buttonAfterOpen = await screen.findByRole("button", { name: "Bật nhạc" });
    expect(buttonAfterOpen).toHaveAttribute("aria-hidden", "false");
    expect(buttonAfterOpen).not.toBeDisabled();
    fireEvent.click(buttonAfterOpen);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
