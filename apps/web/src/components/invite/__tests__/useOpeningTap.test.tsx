// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvelopeOpening } from "../opening/EnvelopeOpening";
import { useOpeningTap } from "../opening/useOpeningTap";

const ANIMATION_MS = 800;
const SAFETY_NET_MS = ANIMATION_MS + 400;

afterEach(() => {
  vi.useRealTimers();
});

describe("useOpeningTap", () => {
  it("fires onOpen exactly once via the normal animation-complete path, and the later safety-net timeout does not fire again", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onOpen = vi.fn();
    const { result } = renderHook(() => useOpeningTap(onOpen, ANIMATION_MS));

    act(() => result.current.handleTap());
    act(() => result.current.handleAnimationComplete());
    expect(onOpen).toHaveBeenCalledTimes(1);

    // The safety-net timeout scheduled by `handleTap` should have been
    // cleared by the animation-complete path already firing — advancing
    // past its window must not cause a second call.
    act(() => {
      vi.advanceTimersByTime(SAFETY_NET_MS);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onOpen exactly once via the safety-net timeout when the animation-complete callback never arrives", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onOpen = vi.fn();
    const { result } = renderHook(() => useOpeningTap(onOpen, ANIMATION_MS));

    act(() => result.current.handleTap());
    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SAFETY_NET_MS - 1);
    });
    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores a second handleTap call after the first (no second timer, no double schedule)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onOpen = vi.fn();
    const { result, rerender } = renderHook(() => useOpeningTap(onOpen, ANIMATION_MS));

    act(() => result.current.handleTap());
    rerender();
    act(() => result.current.handleTap());
    rerender();

    act(() => {
      vi.advanceTimersByTime(SAFETY_NET_MS);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("EnvelopeOpening (safety net, through the real component)", () => {
  it("still calls onOpen via the safety net even when framer-motion's onAnimationComplete never fires", () => {
    // Fakes only `setTimeout`/`clearTimeout`, leaving `requestAnimationFrame`
    // real. framer-motion's tween animation is rAF-driven and needs real
    // event-loop turns to progress, which this synchronous test (no
    // `await`/`waitFor`) never yields — so `onAnimationComplete` genuinely
    // cannot fire here, simulating a missed/interrupted animation callback
    // (backgrounded tab, JS error elsewhere, etc). Only the fake,
    // synchronously-advanceable safety-net `setTimeout` can rescue the guest.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onOpen = vi.fn();

    render(
      <EnvelopeOpening
        opening={{ effect: "envelope", particles: "petals", monogram: "M&T", showGuestName: true }}
        guestName="Nguyễn Văn An"
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));
    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SAFETY_NET_MS);
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
