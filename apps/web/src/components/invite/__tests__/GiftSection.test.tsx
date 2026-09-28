// @vitest-environment jsdom
import type { GiftProps, Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiftSection } from "../sections/GiftSection";

function giftSection(accounts: GiftProps["accounts"]): Extract<Section, { type: "gift" }> {
  const base = createSection("gift") as Extract<Section, { type: "gift" }>;
  return {
    ...base,
    props: {
      title: "Hộp mừng cưới",
      description: "Xin chân thành cảm ơn.",
      accounts,
    },
  };
}

const groomAccount: GiftProps["accounts"][number] = {
  side: "groom",
  bankBin: "970436",
  bankName: "Vietcombank",
  accountNumber: "0123456789",
  accountName: "NGUYEN NGOC HAI",
};

const brideAccount: GiftProps["accounts"][number] = {
  side: "bride",
  bankBin: "970422",
  bankName: "MB Bank",
  accountNumber: "0987654321",
  accountName: "le hong tham",
};

describe("GiftSection", () => {
  it("renders one VietQR card per account with bank name and side label", () => {
    render(<GiftSection section={giftSection([groomAccount, brideAccount])} />);

    expect(screen.getAllByTestId("vietqr")).toHaveLength(2);
    expect(screen.getByText("Vietcombank")).toBeInTheDocument();
    expect(screen.getByText("MB Bank")).toBeInTheDocument();
    expect(screen.getByText("Nhà trai")).toBeInTheDocument();
    expect(screen.getByText("Nhà gái")).toBeInTheDocument();
  });

  /*
   * The QR used to be `size={168}`, a hard pixel value larger than the card
   * that holds it: two-up in a 430px column each card measures 182px with
   * 16px padding, so the code forced its own wrapper to 184px and crossed
   * the card's border on both sides. jsdom has no layout, so this cannot
   * assert the measurement — it pins the mechanism instead. A fixed width
   * cannot adapt to the card; only a fluid one can, and reverting to a
   * hardcoded size is what this catches.
   */
  it("sizes the QR from its container instead of a fixed width that can outgrow the card", () => {
    render(<GiftSection section={giftSection([groomAccount])} />);

    const wrapper = screen.getByTestId("vietqr");
    const svg = wrapper.querySelector("svg");

    expect(svg?.getAttribute("class") ?? "(no class at all — a fixed-width QR)").toContain("w-full");
    // Capped, or the one-column layout below 360px would blow it up to the
    // full width of the card.
    expect(wrapper.className).toMatch(/max-w-\[\d+px\]/);
    // The viewBox is what lets CSS scale it; without it `w-full` would
    // stretch the code and break the module grid a camera reads.
    expect(svg?.getAttribute("viewBox")).toBeTruthy();
  });

  it("uppercases the account name", () => {
    render(<GiftSection section={giftSection([brideAccount])} />);

    expect(screen.getByText("LE HONG THAM")).toBeInTheDocument();
  });

  // C8: visual grouping must never leak into the SELECTABLE/copyable text —
  // most Vietnamese banking apps reject a pasted account number containing
  // spaces, and a guest without a working clipboard button (see the
  // "clipboard unavailable" test below) falls back to manually selecting
  // this exact text.
  describe("account number grouping (C8)", () => {
    it("renders the account number with no literal space character in its text content", () => {
      render(<GiftSection section={giftSection([brideAccount])} />);

      const digitsOnly = screen.getByText((_content, element) =>
        element?.tagName.toLowerCase() === "p" && element.textContent === brideAccount.accountNumber,
      );
      expect(digitsOnly).toBeInTheDocument();
      expect(digitsOnly.textContent).not.toContain(" ");
    });

    it("still visually groups the digits (a margin between groups, not a space character)", () => {
      render(<GiftSection section={giftSection([brideAccount])} />);

      // "0987654321" (10 digits) groups as 0987|6543|21 — a visual gap
      // after the 4th and 8th digit (1-indexed), applied as inline style on
      // those specific <span> characters, never as ` ` in the text.
      const digitSpans = screen.getAllByText(/^\d$/);
      expect(digitSpans).toHaveLength(brideAccount.accountNumber.length);
      expect(digitSpans[3]?.style.marginRight).toBe("0.4em");
      expect(digitSpans[7]?.style.marginRight).toBe("0.4em");
      expect(digitSpans[2]?.style.marginRight).toBeFalsy();
    });
  });

  it("copies the account number to the clipboard when 'Sao chép STK' is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<GiftSection section={giftSection([groomAccount, brideAccount])} />);

    fireEvent.click(screen.getAllByText("Sao chép STK")[1]);

    expect(writeText).toHaveBeenCalledWith("0987654321");
    expect(await screen.findByText("Đã sao chép!")).toBeInTheDocument();
  });

  it("renders null when there are no accounts", () => {
    const { container } = render(<GiftSection section={giftSection([])} />);

    expect(container.firstChild).toBeNull();
  });

  // C8 (was Review fix (B), now goes further): in-app WebViews (Zalo,
  // Facebook Messenger) frequently don't expose navigator.clipboard at
  // all. Calling .writeText unguarded used to throw inside the click
  // handler; the button is guarded against that now, but a guest still had
  // no way to know the button was dead — the whole "Sao chép STK" control
  // used to silently no-op with zero feedback. It's now replaced with a
  // Vietnamese hint telling them to copy manually.
  it("hides the (dead) copy button and shows a Vietnamese manual-copy hint when navigator.clipboard is unavailable", () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    render(<GiftSection section={giftSection([groomAccount])} />);

    expect(screen.queryByText("Sao chép STK")).not.toBeInTheDocument();
    expect(screen.getByText("Vui lòng bôi đen và sao chép số tài khoản ở trên.")).toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  });

  it("does not throw when navigator.clipboard.writeText itself is missing (clipboard object present but incomplete)", () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: {}, configurable: true });

    expect(() => render(<GiftSection section={giftSection([groomAccount])} />)).not.toThrow();
    expect(screen.queryByText("Sao chép STK")).not.toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  });

  // Review fix (B): a rejected clipboard write (permission denied, etc.)
  // used to still flip the button to "Đã sao chép!" — a false success.
  it("does not show the success state when the clipboard write is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<GiftSection section={giftSection([groomAccount])} />);
    fireEvent.click(screen.getByText("Sao chép STK"));

    // Let the rejected promise's microtask (and the component's catch
    // block) run before asserting nothing changed.
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText("Đã sao chép!")).not.toBeInTheDocument();
    expect(screen.getByText("Sao chép STK")).toBeInTheDocument();
  });

  // Review fix (D): GiftAccountSchema now requires non-empty bankBin/
  // accountNumber for anything that's passed through validation, but this
  // component also renders the editor's live, unvalidated draft document —
  // an account the couple is still filling in can transiently have empty
  // strings. A blank bankBin/accountNumber used to reach
  // buildVietQRPayload's tlv() encoder, which throws on an empty TLV value.
  it("skips a half-filled account (empty bankBin/accountNumber) instead of rendering a broken QR", () => {
    const halfFilled: GiftProps["accounts"][number] = {
      side: "groom",
      bankBin: "",
      bankName: "Vietcombank",
      accountNumber: "",
      accountName: "NGUYEN NGOC HAI",
    };

    expect(() =>
      render(<GiftSection section={giftSection([halfFilled, brideAccount])} />),
    ).not.toThrow();

    expect(screen.getAllByTestId("vietqr")).toHaveLength(1);
    expect(screen.queryByText("Nhà trai")).not.toBeInTheDocument();
    expect(screen.getByText("Nhà gái")).toBeInTheDocument();
  });

  it("renders null when every account is half-filled", () => {
    const halfFilled: GiftProps["accounts"][number] = {
      side: "groom",
      bankBin: "",
      bankName: "Vietcombank",
      accountNumber: "",
      accountName: "NGUYEN NGOC HAI",
    };

    const { container } = render(<GiftSection section={giftSection([halfFilled])} />);

    expect(container.firstChild).toBeNull();
  });
});

/**
 * Reviewer-reported regression: `clipboardAvailable` used to be computed
 * during render (`navigator.clipboard?.writeText` checked synchronously).
 * A real Node SSR environment has a `navigator` global but no
 * `navigator.clipboard`, so the server always rendered the manual-copy
 * hint; a real browser's secure-context client has `navigator.clipboard`
 * and rendered the button instead — a genuine content mismatch between the
 * server-rendered HTML and the client's own first render, which React
 * cannot reconcile ("Hydration failed because the server rendered HTML
 * didn't match the client"). Reproduced on every `/i/[slug]` view with a
 * gift section (the default document seeds two).
 *
 * Fix mirrors `useMediaQuery` (Task 15): never read the browser-only
 * capability during render. Both the server and the client's pre-effect
 * render always assume the button (matching each other by construction);
 * `useEffect` — client-only, runs after hydration — corrects to the hint
 * once the real capability is known. Test shape mirrors
 * `useMediaQuery.test.tsx`'s own hydration-safety block.
 */
describe("GiftAccountCard SSR/hydration parity (clipboard capability)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
  });

  it("server-rendered markup always shows the button, never the hint — a real Node SSR environment has no navigator.clipboard at all", () => {
    const html = renderToStaticMarkup(<GiftSection section={giftSection([groomAccount])} />);

    expect(html).toContain("Sao chép STK");
    expect(html).not.toContain("Vui lòng bôi đen");
  });

  it("the client's own pre-effect (first) render produces the same markup as SSR, regardless of the real clipboard capability", () => {
    // The real client environment HAS clipboard — exactly the scenario that
    // used to disagree with the server's render.
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() }, configurable: true });

    const container = document.createElement("div");
    document.body.appendChild(container);
    // `flushSync` commits synchronously without flushing passive effects
    // (unlike `act`, which would also run the `useEffect` this test needs
    // to observe the DOM *before*) — same technique as
    // `useMediaQuery.test.tsx`'s pre-effect probe.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = createRoot(container);
    try {
      flushSync(() => {
        root.render(<GiftSection section={giftSection([groomAccount])} />);
      });

      expect(container.textContent).toContain("Sao chép STK");
      expect(container.textContent).not.toContain("Vui lòng bôi đen");
    } finally {
      root.unmount();
      container.remove();
      consoleError.mockRestore();
    }
  });

  it("hydrates with no mismatch warning, then swaps to the manual-copy hint once effects flush and confirm clipboard is truly unavailable", async () => {
    // Built ONCE and reused for both the "server" and "client" render below
    // — `giftSection()` goes through `createSection`, which mints a fresh
    // random `id` per call; calling it twice would produce a real
    // `data-section-id` mismatch of this test's own making, unrelated to
    // the clipboard behavior actually under test.
    const section = giftSection([groomAccount]);

    // Real Node SSR: no navigator.clipboard.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const html = renderToStaticMarkup(<GiftSection section={section} />);
    expect(html).toContain("Sao chép STK");

    // The guest's real client also lacks it (e.g. an in-app WebView) —
    // the actual case this whole fix is for.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // `onRecoverableError` is React's own, canonical hook for exactly this:
    // it fires once per hydration mismatch React had to recover from,
    // regardless of severity. A plain `console.error` spy is NOT reliable
    // here — a full element-type swap (e.g. `<button>` vs `<p>`, the exact
    // shape of this bug) is reported through a different, asynchronous
    // channel (`reportError`) that a synchronous spy inside `act()` can
    // miss entirely, while a same-tag attribute-only mismatch IS reported
    // straight to `console.error`. `onRecoverableError` catches both
    // uniformly.
    const recoverableErrors: unknown[] = [];
    try {
      await act(async () => {
        hydrateRoot(container, <GiftSection section={section} />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors).toEqual([]);

      // The effect has now run (wrapped in the `act` above) and confirmed
      // clipboard is genuinely unavailable — the hint replaces the button.
      expect(container.textContent).toContain("Vui lòng bôi đen");
      expect(container.textContent).not.toContain("Sao chép STK");
    } finally {
      container.remove();
    }
  });

  it("hydrates cleanly and keeps the button (no swap) when the real client clipboard turns out to be available", async () => {
    // Same "build once, reuse for both renders" note as the test above.
    const section = giftSection([groomAccount]);

    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const html = renderToStaticMarkup(<GiftSection section={section} />);

    // The real client DOES have a working clipboard — the effect must
    // leave the button in place rather than swapping to the hint.
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() }, configurable: true });

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // See the previous test's comment on why `onRecoverableError` (not a
    // `console.error` spy) is the reliable way to detect this.
    const recoverableErrors: unknown[] = [];
    try {
      await act(async () => {
        hydrateRoot(container, <GiftSection section={section} />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors).toEqual([]);
      expect(container.textContent).toContain("Sao chép STK");
      expect(container.textContent).not.toContain("Vui lòng bôi đen");
    } finally {
      container.remove();
    }
  });

  // The confirmation resets itself after two seconds. That timer belongs to
  // this component, and a guest who copies an account number then keeps
  // scrolling (or closes the page) must not leave it running against an
  // unmounted tree.
  it("clears the copy-confirmation timer when the card unmounts", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const { unmount } = render(<GiftSection section={giftSection([brideAccount])} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Sao chép/ })[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalled());

    const before = clearSpy.mock.calls.length;
    unmount();

    expect(clearSpy.mock.calls.length).toBeGreaterThan(before);
    clearSpy.mockRestore();
  });
});
