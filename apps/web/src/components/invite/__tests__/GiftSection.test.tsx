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

  it("formats the account number in groups of 4 and uppercases the account name", () => {
    render(<GiftSection section={giftSection([brideAccount])} />);

    expect(screen.getByText("0987 6543 21")).toBeInTheDocument();
    expect(screen.getByText("TRAN THU HA")).toBeInTheDocument();
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

  // Review fix (B): in-app WebViews (Zalo, Facebook Messenger) frequently
  // don't expose navigator.clipboard at all. Calling .writeText unguarded
  // used to throw inside the click handler — per the DOM spec, jsdom (like
  // real browsers) doesn't propagate that back through fireEvent.click's
  // call stack, it reports it as an uncaught "error" event instead, so that
  // event is what this test listens for rather than a synchronous throw.
  it("does not throw and shows no false success when navigator.clipboard is unavailable", async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const onUncaughtError = vi.fn();
    window.addEventListener("error", onUncaughtError);

    render(<GiftSection section={giftSection([groomAccount])} />);
    fireEvent.click(screen.getByText("Sao chép STK"));
    // Give a would-be uncaught exception a task to surface as a window
    // "error" event before asserting none did.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUncaughtError).not.toHaveBeenCalled();
    expect(screen.getByText("Sao chép STK")).toBeInTheDocument();
    expect(screen.queryByText("Đã sao chép!")).not.toBeInTheDocument();

    window.removeEventListener("error", onUncaughtError);
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
