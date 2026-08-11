// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BaoMatPage, { metadata } from "../page";

describe("BaoMatPage (/bao-mat)", () => {
  it("renders the not-lawyer-reviewed draft notice", () => {
    render(<BaoMatPage />);

    expect(screen.getByRole("note")).toHaveTextContent(/chưa được luật sư rà soát/i);
  });

  it("renders the heading and last-updated date", () => {
    render(<BaoMatPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Chính sách bảo mật" })).toBeInTheDocument();
    expect(screen.getByText(/11\/08\/2026/)).toBeInTheDocument();
  });

  it("describes what data is stored: account, invitation content, uploads, guest submissions, view counts", () => {
    render(<BaoMatPage />);

    expect(screen.getAllByText(/Thông tin tài khoản/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nội dung thiệp/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/File bạn tải lên/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dữ liệu khách mời/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Số lượt xem/).length).toBeGreaterThan(0);
  });

  it("states there is no third-party analytics and that guest submissions are visible to the couple", () => {
    render(<BaoMatPage />);

    expect(screen.getByText(/không nhúng Google Analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/luôn hiển thị cho chủ thiệp/)).toBeInTheDocument();
  });

  it("explains how to request deletion via the dashboard delete button and a contact placeholder", () => {
    render(<BaoMatPage />);

    expect(screen.getByText(/"Xoá"/)).toBeInTheDocument();
    expect(screen.getAllByText(/CẦN ĐIỀN/).length).toBeGreaterThan(0);
  });

  it("exports Vietnamese page metadata", () => {
    expect(metadata.title).toBe("Chính sách bảo mật — HPWD");
    expect(typeof metadata.description).toBe("string");
  });
});
