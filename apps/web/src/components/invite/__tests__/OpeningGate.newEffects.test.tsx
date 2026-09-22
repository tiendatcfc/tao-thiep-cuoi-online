// @vitest-environment jsdom
import type { Opening } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { OpeningGate } from "../opening/OpeningGate";
import { PetalsOpening } from "../opening/PetalsOpening";
import { RevealOpening } from "../opening/RevealOpening";
import type { OpeningVariantProps } from "../opening/types";

/**
 * Task 9's two new opening effects. Like `OpeningGate.test.tsx`, this file
 * never stubs `window.matchMedia`, so framer-motion's `useReducedMotion()`
 * resolves to `false` and every case here exercises the real animation
 * path; the reduced-motion branch lives in its own file because
 * motion-dom caches that lookup in a module-level singleton.
 *
 * Both variants are held to the same three invariants the existing three
 * were built around, each of which cost a Phase 1 bug:
 *
 *   1. The tap target is a real `<button>` — not a div with onClick — so
 *      it is reachable by keyboard and by a screen reader.
 *   2. `onOpen` runs exactly once, and the ONLY path to it is not the
 *      animation callback: `useOpeningTap`'s `animationMs + 400` safety
 *      net must still open the invitation if that callback never arrives.
 *   3. `onTap` runs SYNCHRONOUSLY inside the click handler, because iOS
 *      WebKit only honours `audio.play()` inside the gesture's own call
 *      stack — the reason music silently never started on iPhones.
 */

const VARIANTS: [string, (props: OpeningVariantProps) => React.ReactElement, number][] = [
  ["RevealOpening", RevealOpening, 700],
  ["PetalsOpening", PetalsOpening, 750],
];

function opening(overrides: Partial<Opening> = {}): Opening {
  return { effect: "reveal", particles: null, monogram: "M&T", showGuestName: true, ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(VARIANTS)("%s", (name, Variant, animationMs) => {
  function renderVariant(props: Partial<OpeningVariantProps> = {}) {
    const onOpen = props.onOpen ?? vi.fn();
    const onTap = props.onTap;
    render(
      <Variant
        opening={props.opening ?? opening()}
        guestName={props.guestName === undefined ? "Nguyễn Văn An" : props.guestName}
        onOpen={onOpen}
        onTap={onTap}
      />,
    );
    return { onOpen, onTap };
  }

  it("offers a real, focusable button rather than a clickable div", () => {
    renderVariant();

    const button = screen.getByRole("button", { name: "Mở thiệp" });
    expect(button.tagName).toBe("BUTTON");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("shows the monogram and the guest's name", () => {
    renderVariant();

    expect(screen.getByText("M&T")).toBeInTheDocument();
    // The label and the name are two lines now ("Kính mời" set as a
    // tracked small-caps label above the name), not the single
    // "Kính mời: <name>" string they used to be — so each is asserted on
    // its own rather than as one run of text.
    expect(screen.getByText("Kính mời")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
  });

  it("hides the guest's name when the couple turned that off", () => {
    renderVariant({ opening: opening({ showGuestName: false }) });

    expect(screen.queryByText(/Kính mời/)).not.toBeInTheDocument();
  });

  it("calls onOpen exactly once on tap, via the normal animation path", async () => {
    const { onOpen } = renderVariant();

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // Well past the safety net's window: the cleared timeout must not
    // produce a second call.
    await new Promise((resolve) => setTimeout(resolve, animationMs + 500));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it(`still opens after ${animationMs + 400}ms when the animation callback never arrives`, () => {
    // Fake timers freeze framer-motion's rAF loop, so
    // `onAnimationComplete` genuinely never fires — the exact situation a
    // backgrounded tab produces, and the one that used to leave a guest
    // stuck behind a disabled button with an inert invitation underneath.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { onOpen } = renderVariant();

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));
    expect(onOpen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(animationMs + 399);
    expect(onOpen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onTap synchronously inside the click handler, before onOpen", () => {
    // iOS WebKit only counts `audio.play()` as user-initiated while still
    // inside the gesture's own call stack. Fake timers guarantee nothing
    // asynchronous can have run by the time the assertion below executes.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onTap = vi.fn();
    const { onOpen } = renderVariant({ onTap });

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("disables the button after the first tap so a double tap cannot re-trigger it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { onOpen } = renderVariant();
    const button = screen.getByRole("button", { name: "Mở thiệp" });

    fireEvent.click(button);
    fireEvent.click(button);
    vi.advanceTimersByTime(animationMs + 400);

    expect(button).toBeDisabled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("RevealOpening's split composition", () => {
  it("never leaves the upper panel empty, even with no monogram and no guest name", () => {
    // The common case, not an edge one: `createDefaultDocument` starts with
    // an empty monogram, and a guest name only exists on a personalised
    // `?g=` link. Without a fallback ornament the effect renders as a blank
    // screen with a hairline across it.
    const { container } = render(
      <RevealOpening
        opening={opening({ effect: "reveal", monogram: "", showGuestName: false })}
        guestName={null}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-opening-ornament]")).not.toBeNull();
  });
});

describe("OpeningGate wires the new effects up", () => {
  function renderGate(effect: Opening["effect"], onOpened: () => void) {
    return render(
      <InviteContext.Provider value={{ guestName: "An", showGuestName: true, isPreview: false, slug: null }}>
        <OpeningGate opening={opening({ effect })} guestName="An" onOpened={onOpened}>
          <div>Nội dung thiệp</div>
        </OpeningGate>
      </InviteContext.Provider>,
    );
  }

  it.each(["reveal", "petals"] as const)("gates the invitation behind the %s overlay", (effect) => {
    const { container } = renderGate(effect, vi.fn());

    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();
    expect(within(wrapper as HTMLElement).getByText("Nội dung thiệp")).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Mở thiệp" })).toBeInTheDocument();
  });

  it.each(["reveal", "petals"] as const)("reveals the invitation once %s is tapped", async (effect) => {
    const onOpened = vi.fn();
    const { container } = renderGate(effect, onOpened);

    fireEvent.click(screen.getByRole("button", { name: "Mở thiệp" }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const wrapper = container.querySelector("[data-opening-content]");
    expect(wrapper).not.toHaveAttribute("aria-hidden");
    expect(wrapper).not.toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "Mở thiệp" })).not.toBeInTheDocument();
  });
});
