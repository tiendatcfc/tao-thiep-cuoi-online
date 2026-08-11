// @vitest-environment jsdom
import type { GiftProps, Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  accountName: "NGUYEN MINH KHANG",
};

const brideAccount: GiftProps["accounts"][number] = {
  side: "bride",
  bankBin: "970422",
  bankName: "MB Bank",
  accountNumber: "0987654321",
  accountName: "tran thu ha",
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

  it("uppercases the account name", () => {
    render(<GiftSection section={giftSection([brideAccount])} />);

    expect(screen.getByText("TRAN THU HA")).toBeInTheDocument();
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
      accountName: "NGUYEN MINH KHANG",
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
      accountName: "NGUYEN MINH KHANG",
    };

    const { container } = render(<GiftSection section={giftSection([halfFilled])} />);

    expect(container.firstChild).toBeNull();
  });
});
