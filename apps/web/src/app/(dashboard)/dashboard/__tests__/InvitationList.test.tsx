// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { InvitationList } from "../InvitationList";
import type { DashboardInvitation } from "../InvitationCard";

describe("InvitationList", () => {
  it("shows a friendly empty state with a link to the template gallery when there are no invitations", () => {
    render(<InvitationList invitations={[]} />);

    expect(screen.getByText(/chưa có thiệp/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mẫu thiệp/i })).toHaveAttribute("href", "/mau-thiep");
  });

  it("renders one card per invitation, with actions matching each invitation's status", () => {
    const invitations: DashboardInvitation[] = [
      {
        id: "draft-1",
        slug: "nhap-abc",
        status: "draft",
        publishedAt: null,
        viewCount: 0,
        updatedAt: "2026-08-10T10:00:00.000Z",
        coverNames: "Minh & Lan",
      },
      {
        id: "pub-1",
        slug: "minh-lan",
        status: "published",
        publishedAt: "2026-08-01T00:00:00.000Z",
        viewCount: 7,
        updatedAt: "2026-08-09T10:00:00.000Z",
        coverNames: "Hải & Thắm",
      },
    ];

    render(<InvitationList invitations={invitations} />);

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);

    const draftCard = cards.find((c) => within(c).queryByText("Minh & Lan"));
    const publishedCard = cards.find((c) => within(c).queryByText("Hải & Thắm"));
    expect(draftCard).toBeDefined();
    expect(publishedCard).toBeDefined();

    expect(within(draftCard!).getByText("Nháp")).toBeInTheDocument();
    expect(within(draftCard!).queryByRole("link", { name: "Xem" })).not.toBeInTheDocument();

    expect(within(publishedCard!).getByText("Đã xuất bản")).toBeInTheDocument();
    expect(within(publishedCard!).getByRole("link", { name: "Xem" })).toHaveAttribute("href", "/i/minh-lan");
    expect(within(publishedCard!).getByText(/7/)).toBeInTheDocument();

    // Every card offers the same edit/wishes/responses/delete actions.
    for (const card of cards) {
      expect(within(card).getByRole("link", { name: "Chỉnh sửa" })).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Lời chúc" })).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Phản hồi" })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Xoá" })).toBeInTheDocument();
    }
  });
});
