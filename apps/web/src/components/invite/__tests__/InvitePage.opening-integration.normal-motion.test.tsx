// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitePage } from "../InvitePage";

// Companion to `InvitePage.opening-integration.test.tsx`, which forces
// `prefers-reduced-motion` for a fast/deterministic check of the gesture ->
// audio wiring. That shortcut also suppresses `ParticlesOverlay` (reduced
// motion means no particles at all), so it can't prove particles show up
// post-open. This file deliberately does NOT stub `matchMedia`, exercising
// the real, non-reduced-motion envelope animation end-to-end — proving both
// the audio unlock *and* the particle overlay appear once the real
// animation completes. Kept in its own file for the same module-singleton
// reason documented in `OpeningGate.reduced-motion.test.tsx`.
describe("InvitePage / opening gate integration (real animation timing)", () => {
  let playSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.play = playSpy as unknown as HTMLMediaElement["play"];
    window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
  });

  it("plays music and shows the falling-petals overlay once the real envelope animation finishes", async () => {
    const document = createDefaultDocument();
    document.opening = { effect: "envelope", particles: "petals", monogram: "M&T", showGuestName: true };
    document.music = { source: "upload", url: "https://cdn.test/song.mp3", trackId: null, assetId: null, playAfterOpen: true };

    const { container } = render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={{ showBadge: false }}
        isPreview={false}
      />,
    );

    expect(playSpy).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    // C1: play() now fires synchronously on the raw tap itself (see
    // useOpeningTap's `onTap`), deliberately decoupled from the animation
    // — that's the whole point of the fix (strict WebKit only honors
    // `play()` as user-gesture-triggered inside this exact call stack, not
    // ~1s later once the animation finishes). No `waitFor` needed for this
    // assertion anymore.
    expect(playSpy).toHaveBeenCalledTimes(1);
    // The particle overlay is a separate concern, still correctly gated on
    // the REAL envelope animation actually finishing (`onOpened`), which
    // takes real time regardless of when audio started.
    await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull(), { timeout: 3000 });
  });
});
