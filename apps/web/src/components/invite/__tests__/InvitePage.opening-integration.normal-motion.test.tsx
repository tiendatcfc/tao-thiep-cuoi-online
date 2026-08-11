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
    document.music = { source: "upload", url: "https://cdn.test/song.mp3", trackId: null, playAfterOpen: true };

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

    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});
