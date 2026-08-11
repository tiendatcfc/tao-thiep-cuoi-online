// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DieuKhoanPage, { metadata } from "../page";

describe("DieuKhoanPage (/dieu-khoan)", () => {
  it("renders the not-lawyer-reviewed draft notice", () => {
    render(<DieuKhoanPage />);

    expect(screen.getByRole("note")).toHaveTextContent(/chưa được luật sư rà soát/i);
  });

  it("renders the heading, last-updated date, and a contact placeholder", () => {
    render(<DieuKhoanPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Điều khoản sử dụng" })).toBeInTheDocument();
    expect(screen.getByText(/11\/08\/2026/)).toBeInTheDocument();
    // The placeholder must stay unmistakably a placeholder, not a plausible
    // real address — see apps/web/src/app/(legal)/constants.ts.
    expect(screen.getAllByText(/CẦN ĐIỀN/).length).toBeGreaterThan(0);
  });

  it("mentions the free service, Google sign-in, dashboard delete, and no-uptime-guarantee terms", () => {
    render(<DieuKhoanPage />);

    expect(screen.getByText(/hoàn toàn miễn phí/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Google/).length).toBeGreaterThan(0);
    expect(screen.getByText(/"Xoá"/)).toBeInTheDocument();
    expect(screen.getByText(/nguyên trạng/i)).toBeInTheDocument();
  });

  it("exports Vietnamese page metadata", () => {
    expect(metadata.title).toBe("Điều khoản sử dụng — HPWD");
    expect(typeof metadata.description).toBe("string");
  });
});
