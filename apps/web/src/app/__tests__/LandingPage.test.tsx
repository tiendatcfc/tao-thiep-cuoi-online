// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FEATURES, LandingPage, type LandingTemplate } from "../LandingPage";

const templates: LandingTemplate[] = [
  { id: "t1", name: "Tối giản", thumbnailUrl: "/placeholder-template.png" },
  { id: "t2", name: "Vườn hồng", thumbnailUrl: "/placeholder-template.png" },
];

describe("LandingPage", () => {
  it("links the primary hero CTA to /mau-thiep and the secondary CTA to /i/demo", () => {
    render(<LandingPage templates={templates} />);

    expect(screen.getByRole("link", { name: "Tạo thiệp miễn phí" })).toHaveAttribute(
      "href",
      "/mau-thiep",
    );
    expect(screen.getByRole("link", { name: "Xem thiệp mẫu" })).toHaveAttribute("href", "/i/demo");
  });

  it("renders a headline making the free/no-watermark promise concrete", () => {
    render(<LandingPage templates={templates} />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/miễn phí/i);
    expect(heading).toHaveTextContent(/watermark/i);
  });

  it("renders every feature in the grid, with its Vietnamese label and description", () => {
    render(<LandingPage templates={templates} />);

    for (const feature of FEATURES) {
      expect(screen.getByText(feature.label)).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    }
  });

  it("marks exactly the unshipped features with a 'Sắp có' badge, and no shipped one", () => {
    render(<LandingPage templates={templates} />);

    const badges = screen.getAllByTestId("coming-soon");
    const unshippedCount = FEATURES.filter((f) => !f.shipped).length;
    expect(badges).toHaveLength(unshippedCount);
    for (const badge of badges) {
      expect(badge).toHaveTextContent("Sắp có");
    }
  });

  it("does not claim any of the coming-later features are shipped", () => {
    // Guards the content itself, not just the rendering: a future edit that
    // accidentally flips one of these to `shipped: true` without actually
    // building it would be a false advertising claim.
    const comingSoonIds = FEATURES.filter((f) => !f.shipped).map((f) => f.id);
    expect(comingSoonIds.sort()).toEqual(
      [
        "guest-name-links",
        "custom-music-upload",
        "youtube-embed",
        "text-hyperlinks",
        "ai-background-removal",
        "custom-font-upload",
        "premium-templates",
      ].sort(),
    );
  });

  it("renders one thumbnail per template, each linking to /mau-thiep", () => {
    render(<LandingPage templates={templates} />);

    expect(screen.getByAltText("Tối giản")).toBeInTheDocument();
    expect(screen.getByAltText("Vườn hồng")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /Tối giản|Vườn hồng/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/mau-thiep");
    }
  });

  it("degrades to an empty-state message instead of a broken strip when there are no templates", () => {
    render(<LandingPage templates={[]} />);

    expect(screen.getByText("Chưa có mẫu thiệp nào.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("links the footer to the legal pages", () => {
    render(<LandingPage templates={templates} />);

    expect(screen.getByRole("link", { name: "Điều khoản sử dụng" })).toHaveAttribute(
      "href",
      "/dieu-khoan",
    );
    expect(screen.getByRole("link", { name: "Chính sách bảo mật" })).toHaveAttribute(
      "href",
      "/bao-mat",
    );
  });
});
