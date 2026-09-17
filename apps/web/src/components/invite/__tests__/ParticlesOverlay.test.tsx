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

  /**
   * The canvas sits at `z-40`, i.e. ON TOP of the invitation's own text. Solid
   * fills there paint opaque blobs over the names, parents' names and venue
   * addresses — the whole point of the card. Every particle fill must therefore
   * happen at a reduced `globalAlpha`.
   */
  it.each(["petals", "confetti"] as const)(
    "draws %s translucently so they never obscure the text underneath",
    (kind) => {
      const alphasAtFill: number[] = [];
      const ctx = {
        globalAlpha: 1,
        fillStyle: "",
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(() => alphasAtFill.push(ctx.globalAlpha)),
        fillRect: vi.fn(() => alphasAtFill.push(ctx.globalAlpha)),
      };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        ctx as unknown as CanvasRenderingContext2D,
      );
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation(() => 1);

      render(<ParticlesOverlay kind={kind} />);

      const tick = rafSpy.mock.calls[0]?.[0];
      expect(tick).toBeTypeOf("function");
      tick!(0);

      expect(alphasAtFill.length).toBeGreaterThan(0);
      for (const alpha of alphasAtFill) {
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(1);
      }
    },
  );

  it("cancels its requestAnimationFrame loop and removes the resize listener on unmount", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ParticlesOverlay kind="confetti" />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
