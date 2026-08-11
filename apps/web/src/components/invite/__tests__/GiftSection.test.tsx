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

  it("copies the account number to the clipboard when 'Sao chép STK' is clicked", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<GiftSection section={giftSection([groomAccount, brideAccount])} />);

    fireEvent.click(screen.getAllByText("Sao chép STK")[1]);

    expect(writeText).toHaveBeenCalledWith("0987654321");
  });

  it("renders null when there are no accounts", () => {
    const { container } = render(<GiftSection section={giftSection([])} />);

    expect(container.firstChild).toBeNull();
  });
});
