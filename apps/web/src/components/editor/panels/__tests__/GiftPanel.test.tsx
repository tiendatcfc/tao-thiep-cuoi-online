// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { GiftPanel } from "../GiftPanel";

function giftSection(): Extract<Section, { type: "gift" }> {
  const base = createSection("gift") as Extract<Section, { type: "gift" }>;
  base.props.accounts = [{ side: "groom", bankBin: "", bankName: "", accountNumber: "", accountName: "" }];
  return base;
}

beforeEach(() => {
  useEditorStore.setState({
    document: { version: 1, sections: [] } as never,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("GiftPanel", () => {
  it("shows a hint instead of a QR code before a bank and account number are set", () => {
    render(<GiftPanel section={giftSection()} />);
    expect(screen.getByText("Chọn ngân hàng và nhập số tài khoản để xem mã QR.")).toBeInTheDocument();
  });

  it("selecting a bank sets a bankBin that matches the schema's /^\\d{4,8}$/ pattern", () => {
    const section = giftSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<GiftPanel section={section} />);

    fireEvent.change(screen.getByLabelText("Ngân hàng"), { target: { value: "Vietcombank" } });
    fireEvent.click(screen.getByRole("option", { name: /Vietcombank/ }));

    const updated = useEditorStore
      .getState()
      .document.sections.find((s) => s.id === section.id) as Extract<Section, { type: "gift" }>;
    expect(updated.props.accounts[0].bankBin).toMatch(/^\d{4,8}$/);
    expect(updated.props.accounts[0].bankName).toBe("Vietcombank");
  });

  it("strips non-digit characters from the account number as the user types", () => {
    const section = giftSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<GiftPanel section={section} />);

    const input = screen.getByLabelText("Số tài khoản");
    fireEvent.change(input, { target: { value: "0abc123-456 def" } });
    expect(input).toHaveValue("0123456");
  });

  it("uppercases and strips diacritics from the account name as the user types", () => {
    const section = giftSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<GiftPanel section={section} />);

    const input = screen.getByLabelText("Tên chủ tài khoản");
    fireEvent.change(input, { target: { value: "nguyễn văn an" } });
    expect(input).toHaveValue("NGUYEN VAN AN");
  });

  it("renders a QR code (react-qr-code SVG) once bank + account number are both set, replacing the hint", () => {
    const section = giftSection();
    section.props.accounts = [
      { side: "groom", bankBin: "970436", bankName: "Vietcombank", accountNumber: "0123456789", accountName: "NGUYEN VAN AN" },
    ];
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    const { container } = render(<GiftPanel section={section} />);

    expect(screen.getByText("Xem trước mã QR chuyển khoản")).toBeInTheDocument();
    expect(screen.queryByText("Chọn ngân hàng và nhập số tài khoản để xem mã QR.")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("rejects an account number over 30 digits by truncating it (GiftAccountSchema.accountNumber.max(30))", () => {
    const section = giftSection();
    useEditorStore.setState({ document: { version: 1, sections: [section] } as never });
    render(<GiftPanel section={section} />);

    const input = screen.getByLabelText("Số tài khoản");
    fireEvent.change(input, { target: { value: "1".repeat(40) } });
    expect((input as HTMLInputElement).value).toHaveLength(30);
  });

  // Oceanbank has been MBV since 18/12/2024, but the couple's own bank card,
  // their banking app's older screenshots and everyone they ask still say
  // Oceanbank. Typing that has to find the bank, or they conclude it is not
  // supported and pick the wrong one — on the field that routes their
  // wedding money.
  it("finds the renamed bank by the name its customers still use", () => {
    render(<GiftPanel section={giftSection()} />);

    fireEvent.change(screen.getByPlaceholderText("Tìm ngân hàng…"), { target: { value: "oceanbank" } });

    expect(screen.getByText(/MBV — Ngân hàng TNHH MTV Việt Nam Hiện Đại/)).toBeInTheDocument();
  });

  it("finds it by the current name too, and shows only the current one", () => {
    render(<GiftPanel section={giftSection()} />);

    fireEvent.change(screen.getByPlaceholderText("Tìm ngân hàng…"), { target: { value: "MBV" } });

    expect(screen.getByText(/MBV — /)).toBeInTheDocument();
    expect(screen.queryByText(/Oceanbank/)).not.toBeInTheDocument();
  });
});
