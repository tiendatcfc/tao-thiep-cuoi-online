// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticlesOverlay } from "../ParticlesOverlay";

describe("ParticlesOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts a decorative, non-interactive full-viewport canvas", () => {
    const { container } = render(<ParticlesOverlay kind="petals" />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas?.className).toContain("pointer-events-none");
  });

  it("cancels its requestAnimationFrame loop and removes the resize listener on unmount", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ParticlesOverlay kind="confetti" />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
