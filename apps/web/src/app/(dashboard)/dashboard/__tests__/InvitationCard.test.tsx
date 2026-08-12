// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const fetchMock = vi.fn();

import { InvitationCard, type DashboardInvitation } from "../InvitationCard";

const draftInvitation: DashboardInvitation = {
  id: "inv-1",
  slug: "nhap-abc123",
  status: "draft",
  publishedAt: null,
  viewCount: 0,
  updatedAt: "2026-08-10T10:00:00.000Z",
  coverNames: "Minh & Lan",
};

const publishedInvitation: DashboardInvitation = {
  id: "inv-2",
  slug: "minh-lan",
  status: "published",
  publishedAt: "2026-08-01T00:00:00.000Z",
  viewCount: 42,
  updatedAt: "2026-08-09T10:00:00.000Z",
  coverNames: "Minh & Lan",
};

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("InvitationCard", () => {
  it("shows the couple's names and a 'Nháp' badge for a draft invitation, with no view count and no 'Xem' link", () => {
    render(<InvitationCard invitation={draftInvitation} />);

    expect(screen.getByText("Minh & Lan")).toBeInTheDocument();
    expect(screen.getByText("Nháp")).toBeInTheDocument();
    expect(screen.queryByText(/lượt xem/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xem" })).not.toBeInTheDocument();
  });

  it("shows 'Đã xuất bản', the view count, and a working 'Xem' link for a published invitation", () => {
    render(<InvitationCard invitation={publishedInvitation} />);

    expect(screen.getByText("Đã xuất bản")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/i/minh-lan");
  });

  it("links 'Chỉnh sửa' to /editor/{id}", () => {
    render(<InvitationCard invitation={draftInvitation} />);
    expect(screen.getByRole("link", { name: "Chỉnh sửa" })).toHaveAttribute("href", "/editor/inv-1");
  });

  it("links 'Khách mời', 'Lời chúc' and 'Phản hồi' to their dashboard subpages", () => {
    render(<InvitationCard invitation={draftInvitation} />);
    expect(screen.getByRole("link", { name: "Khách mời" })).toHaveAttribute("href", "/dashboard/inv-1/khach-moi");
    expect(screen.getByRole("link", { name: "Lời chúc" })).toHaveAttribute("href", "/dashboard/inv-1/loi-chuc");
    expect(screen.getByRole("link", { name: "Phản hồi" })).toHaveAttribute("href", "/dashboard/inv-1/phan-hoi");
  });

  it("does not call DELETE when the confirm dialog is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<InvitationCard invitation={draftInvitation} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("DELETEs /api/invitations/{id} and refreshes the router when the confirm dialog is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<InvitationCard invitation={draftInvitation} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/invitations/inv-1", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows a Vietnamese error and does not refresh when the delete request fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    render(<InvitationCard invitation={draftInvitation} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(screen.getByText("Không thể xoá thiệp, vui lòng thử lại.")).toBeInTheDocument());
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
