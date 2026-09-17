// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEGAL_LAST_UPDATED } from "../../constants";
import BaoMatPage, { metadata } from "../page";

describe("BaoMatPage (/bao-mat)", () => {
  it("renders the not-lawyer-reviewed draft notice", () => {
    render(<BaoMatPage />);

    expect(screen.getByRole("note")).toHaveTextContent(/chưa được luật sư rà soát/i);
  });

  it("renders the heading and last-updated date", () => {
    render(<BaoMatPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Chính sách bảo mật" })).toBeInTheDocument();
    // Regex, not the bare string: the date is rendered inside
    // "Cập nhật lần cuối: …", and getByText matches a whole element's
    // text. Read from the constant so bumping the date does not break
    // the test while still proving the page actually renders it.
    expect(screen.getByText(new RegExp(LEGAL_LAST_UPDATED))).toBeInTheDocument();
  });

  it("describes what data is stored: account, invitation content, uploads, guest submissions, view counts", () => {
    render(<BaoMatPage />);

    expect(screen.getAllByText(/Thông tin tài khoản/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nội dung thiệp/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/File bạn tải lên/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dữ liệu khách mời/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Số lượt xem/).length).toBeGreaterThan(0);
  });

  it("lists music files in the present-tense storage list, now that music upload has shipped", () => {
    // The inverse of what this test asserted before Phase 2 Task 6. It used
    // to guard against the page claiming to store audio while no upload UI
    // existed; MusicPanel now has a real file picker and the audio route
    // creates MediaAsset rows with kind "audio", so the same <li> must say
    // so. Deliberately kept (not deleted) so the page and the feature can
    // never silently drift apart again in either direction.
    render(<BaoMatPage />);

    const uploadItem = screen.getAllByText(/File bạn tải lên/)[0].closest("li");
    expect(uploadItem).not.toBeNull();
    expect(uploadItem).toHaveTextContent(/nhạc/i);
  });

  it("no longer describes music upload or personalised guest links as unreleased", () => {
    // Both shipped in Phase 2. A privacy policy that understates what is
    // collected is worse than one that is merely vague.
    render(<BaoMatPage />);

    expect(screen.queryByText(/chưa ra mắt/i)).not.toBeInTheDocument();
  });

  it("warns that an uploaded track is downloadable by anyone holding the invitation link", () => {
    render(<BaoMatPage />);

    expect(screen.getByText(/bất kỳ ai có đường link thiệp/i)).toBeInTheDocument();
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
