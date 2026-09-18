// @vitest-environment jsdom
import type { Opening } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { OpeningGate } from "../opening/OpeningGate";

// This suite intentionally never stubs `window.matchMedia`, so
// framer-motion's `useReducedMotion()` falls back to `false` (see
// `initPrefersReducedMotion` in motion-dom: it only checks
// `prefers-reduced-motion` when `window.matchMedia` exists at all) — every
// test here exercises the *real*, non-reduced-motion animation path.
// Production transitions are kept short (well under the 1.2s budget) so
// `waitFor` below resolves quickly and reliably instead of needing a mock.

function opening(overrides: Partial<Opening> = {}): Opening {
  return {
    effect: "envelope",
    particles: "petals",
    monogram: "M&T",
    showGuestName: true,
    ...overrides,
  };
}

function renderGate(
  openingProp: Opening,
  onOpened: () => void,
  options: { guestName?: string | null; isPreview?: boolean } = {},
) {
  const { guestName = "Nguyễn Văn An", isPreview = false } = options;
  return render(
    <InviteContext.Provider value={{ guestName, showGuestName: true, isPreview, slug: null }}>
      <OpeningGate opening={openingProp} guestName={guestName} onOpened={onOpened}>
        <div>Nội dung thiệp</div>
      </OpeningGate>
    </InviteContext.Provider>,
  );
}

describe("OpeningGate", () => {
  it("hides children from assistive tech and interaction before the guest opens the invitation", () => {
    const { container } = renderGate(opening(), vi.fn());

    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();
    expect(within(wrapper as HTMLElement).getByText("Nội dung thiệp")).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("inert");

    // The overlay's own tap target is present and focusable.
    expect(screen.getByRole("button", { name: "Mở thiệp" })).toBeInTheDocument();
  });

  it("opens when the guest taps the visible 'Mở thiệp' pill, not just the envelope graphic", async () => {
    // The pill is the thing that LOOKS like a button — rounded, filled with
    // the primary colour, drop shadow. It used to be a decorative <span>
    // sitting outside the real control (the envelope graphic above it), so
    // a guest who tapped the obvious target got nothing at all.
    const onOpened = vi.fn();
    renderGate(opening(), onOpened);

    fireEvent.click(screen.getByText("Mở thiệp"));

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("offers exactly one control, so a screen reader is not told about two 'Mở thiệp' buttons", () => {
    renderGate(opening(), vi.fn());

    expect(screen.getAllByRole("button", { name: "Mở thiệp" })).toHaveLength(1);
  });

  it("reveals children and removes the overlay once the guest taps 'Mở thiệp', and calls onOpened", async () => {
    const onOpened = vi.fn();
    const { container } = renderGate(opening(), onOpened);

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 3000 });

    // Task 4: once opened (and hydrated, which @testing-library's `render`
    // already ran effects for), the gate attributes are removed entirely
    // rather than set to their "off" value — `aria-hidden={undefined}` never
    // serializes an `aria-hidden="false"` attribute at all.
    const wrapper = container.querySelector("[data-opening-content]");
    expect(wrapper).not.toBeNull();
    expect(wrapper).not.toHaveAttribute("aria-hidden");
    expect(wrapper).not.toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument();
  });

  it("effect: 'none' shows children immediately and calls onOpened exactly once, even across re-renders", () => {
    // `onOpened` (the spy) is wrapped in a *fresh* inline arrow at each call
    // site below, deliberately mirroring how `InvitePage` really passes it
    // (`onOpened={() => setOpened(true)}`, a new function every render). If
    // the rerender instead reused the exact same prop reference, the
    // effect's dependency array would never see it change and the "only
    // once" guard (`firedRef`) would never actually be exercised.
    const onOpenedSpy = vi.fn();
    const { rerender } = render(
      <InviteContext.Provider value={{ guestName: null, showGuestName: true, isPreview: false, slug: null }}>
        <OpeningGate opening={opening({ effect: "none" })} guestName={null} onOpened={() => onOpenedSpy()}>
          <div>Nội dung thiệp</div>
        </OpeningGate>
      </InviteContext.Provider>,
    );

    expect(screen.getByText("Nội dung thiệp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument();
    expect(onOpenedSpy).toHaveBeenCalledTimes(1);

    rerender(
      <InviteContext.Provider value={{ guestName: null, showGuestName: true, isPreview: false, slug: null }}>
        <OpeningGate opening={opening({ effect: "none" })} guestName={null} onOpened={() => onOpenedSpy()}>
          <div>Nội dung thiệp (đổi)</div>
        </OpeningGate>
      </InviteContext.Provider>,
    );

    expect(onOpenedSpy).toHaveBeenCalledTimes(1);
  });

  it("preview mode renders children immediately with the overlay suppressed and never calls onOpened", () => {
    const onOpened = vi.fn();
    renderGate(opening(), onOpened, { isPreview: true });

    expect(screen.getByText("Nội dung thiệp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument();
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("renders the curtain overlay for effect: 'curtain'", () => {
    renderGate(opening({ effect: "curtain" }), vi.fn());
    expect(screen.getByRole("button", { name: "Mở thiệp" })).toBeInTheDocument();
  });

  it("renders the fade overlay for effect: 'fade'", () => {
    renderGate(opening({ effect: "fade" }), vi.fn());
    expect(screen.getByRole("button", { name: "Mở thiệp" })).toBeInTheDocument();
  });

  // C7: `children` stay mounted (in normal flow) under `inert` while the
  // gate is closed — `inert` blocks focus/click, but NOT scroll, so a guest
  // could swipe/scroll the (fixed, full-screen) overlay away and interact
  // with — or scroll past, burning the `once: true` reveal animations on —
  // content they never consciously "opened".
  describe("body scroll lock while closed (C7)", () => {
    afterEach(() => {
      document.body.style.overflow = "";
    });

    it("locks document.body scroll while the overlay is showing", () => {
      renderGate(opening(), vi.fn());
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores the previous overflow value once the guest opens the invitation", async () => {
      renderGate(opening(), vi.fn());
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

      // Task 4: the opened content wrapper no longer carries a serialized
      // `aria-hidden="false"` (the attribute is removed entirely instead —
      // see the previous test), so the overlay's own removal from the DOM is
      // the reliable signal that `opened` has flipped and the animation/exit
      // has settled.
      await waitFor(() => expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument(), {
        timeout: 3000,
      });
      expect(document.body.style.overflow).toBe("");
    });

    it("restores the previous overflow value on unmount", () => {
      const { unmount } = renderGate(opening(), vi.fn());
      expect(document.body.style.overflow).toBe("hidden");

      unmount();

      expect(document.body.style.overflow).toBe("");
    });

    it("never locks scroll for effect: 'none' (children visible immediately, nothing to scroll behind)", () => {
      render(
        <InviteContext.Provider value={{ guestName: null, showGuestName: true, isPreview: false, slug: null }}>
          <OpeningGate opening={opening({ effect: "none" })} guestName={null} onOpened={vi.fn()}>
            <div>Nội dung thiệp</div>
          </OpeningGate>
        </InviteContext.Provider>,
      );

      expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("never locks scroll in preview mode", () => {
      renderGate(opening(), vi.fn(), { isPreview: true });
      expect(document.body.style.overflow).not.toBe("hidden");
    });
  });
});
