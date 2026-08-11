// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `TemplateGallery` mounts `UseTemplateButton` (a client component) when
// `isAuthenticated` is true, which calls `useRouter()` — that throws
// outside a real Next app router tree, so it's stubbed the same way a
// browser session is stubbed elsewhere in this suite. No test here clicks
// the button, so the mock never needs to do anything.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TemplateGallery, type GalleryTemplate } from "../TemplateGallery";

const templates: GalleryTemplate[] = [
  { id: "t1", name: "Tối giản", tier: "basic", thumbnailUrl: "/placeholder-template.png" },
  { id: "t2", name: "Vườn hồng", tier: "basic", thumbnailUrl: "/placeholder-template.png" },
];

describe("TemplateGallery", () => {
  it("renders one card per template with its name, tier badge, and thumbnail", () => {
    render(<TemplateGallery templates={templates} tier="basic" isAuthenticated={false} />);

    const cards = screen.getAllByTestId("template-card");
    expect(cards).toHaveLength(2);

    expect(within(cards[0]).getByText("Tối giản")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Basic")).toBeInTheDocument();
    expect(within(cards[0]).getByAltText("Tối giản")).toHaveAttribute(
      "src",
      expect.stringContaining("placeholder-template"),
    );
    expect(within(cards[1]).getByText("Vườn hồng")).toBeInTheDocument();
  });

  it("links the 'Dùng mẫu này' action to sign-in (with next=/mau-thiep) when unauthenticated", () => {
    render(<TemplateGallery templates={templates} tier="basic" isAuthenticated={false} />);

    const links = screen.getAllByRole("link", { name: "Dùng mẫu này" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dang-nhap?next=%2Fmau-thiep");
    }
  });

  it("renders 'Dùng mẫu này' as an actionable button (not a sign-in link) when authenticated", () => {
    render(<TemplateGallery templates={templates} tier="basic" isAuthenticated />);

    expect(screen.getAllByRole("button", { name: "Dùng mẫu này" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Dùng mẫu này" })).not.toBeInTheDocument();
  });

  it("shows the Premium 'coming soon' empty state instead of any cards when tier is premium, even if templates were passed", () => {
    render(<TemplateGallery templates={templates} tier="premium" isAuthenticated={false} />);

    expect(screen.getByText("Mẫu Premium sắp ra mắt")).toBeInTheDocument();
    expect(screen.queryByTestId("template-card")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dùng mẫu này" })).not.toBeInTheDocument();
  });

  it("renders the tier filter as links to /mau-thiep?tier=basic and ?tier=premium", () => {
    render(<TemplateGallery templates={templates} tier="basic" isAuthenticated={false} />);

    expect(screen.getByRole("link", { name: "Basic" })).toHaveAttribute("href", "/mau-thiep?tier=basic");
    expect(screen.getByRole("link", { name: "Premium" })).toHaveAttribute("href", "/mau-thiep?tier=premium");
  });
});
