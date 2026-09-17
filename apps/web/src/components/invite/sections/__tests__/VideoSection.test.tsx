// @vitest-environment jsdom
import type { Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoSection } from "../VideoSection";

// The web-component module registers a custom element and pulls CSS — both
// meaningless under jsdom. The component imports it lazily in useEffect; mock
// it so the dynamic import resolves without side effects.
vi.mock("lite-youtube-embed", () => ({}));

const ID = "dQw4w9WgXcQ";

function videoSection(props: { youtubeId: string; caption: string }): Extract<Section, { type: "video" }> {
  const base = createSection("video") as Extract<Section, { type: "video" }>;
  return { ...base, props };
}

describe("VideoSection", () => {
  it("renders nothing when youtubeId is empty", () => {
    const { container } = render(<VideoSection section={videoSection({ youtubeId: "", caption: "" })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when youtubeId cannot be parsed (never interpolates raw input)", () => {
    const { container } = render(
      <VideoSection section={videoSection({ youtubeId: 'javascript:alert(1)"', caption: "x" })} />,
    );
    expect(container.firstChild).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("renders a lite-youtube facade carrying the PARSED id when the stored value is a full URL", () => {
    const { container } = render(
      <VideoSection section={videoSection({ youtubeId: `https://youtu.be/${ID}?si=tracker`, caption: "" })} />,
    );
    const embed = container.querySelector("lite-youtube");
    expect(embed).not.toBeNull();
    expect(embed?.getAttribute("videoid")).toBe(ID);
    // Raw stored value must not leak into any attribute of the embed.
    expect(container.innerHTML).not.toContain("si=tracker");
  });

  it("renders a lite-youtube facade for a bare id, with a watch-page fallback link", () => {
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);
    expect(container.querySelector("lite-youtube")?.getAttribute("videoid")).toBe(ID);
    const link = screen.getByRole("link", { name: /Xem video trên YouTube/ });
    expect(link).toHaveAttribute("href", `https://www.youtube.com/watch?v=${ID}`);
  });

  it("loads NO iframe until the guest taps play — the whole point of the facade", () => {
    // Privacy and weight: an eagerly-embedded YouTube iframe pulls ~1MB and
    // lets Google set cookies on every guest who merely opens the invitation,
    // including the ones who never watch. The <lite-youtube> element only
    // swaps itself for a real iframe on click, so an iframe present at first
    // render would mean the facade had silently stopped being a facade.
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("youtube.com/embed");
  });

  it("carries the data-section hooks every section is required to expose", () => {
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);

    const wrapper = container.querySelector("[data-section]");
    expect(wrapper?.getAttribute("data-section")).toBe("video");
    expect(wrapper?.getAttribute("data-section-id")).toBeTruthy();
  });

  it("renders the caption when present, and no figcaption when empty", () => {
    render(<VideoSection section={videoSection({ youtubeId: ID, caption: "Video cưới của chúng tôi" })} />);
    expect(screen.getByText("Video cưới của chúng tôi")).toBeInTheDocument();
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
