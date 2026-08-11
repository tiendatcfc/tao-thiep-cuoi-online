// @vitest-environment jsdom
import type { AlbumProps, Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlbumSection } from "../sections/AlbumSection";

// yet-another-react-lightbox renders a portal-based overlay that isn't
// meaningful to exercise under jsdom (no real layout/focus trapping). It's
// mocked here so the test can assert on the *props* AlbumSection passes it
// (open/index/slides) — the actual open/close/navigation behavior is the
// library's own well-tested responsibility, not this component's.
const { lightboxSpy } = vi.hoisted(() => ({ lightboxSpy: vi.fn() }));
vi.mock("yet-another-react-lightbox", () => ({
  default: (props: unknown) => {
    lightboxSpy(props);
    return null;
  },
}));

function albumSection(images: AlbumProps["images"]): Extract<Section, { type: "album" }> {
  const base = createSection("album") as Extract<Section, { type: "album" }>;
  return { ...base, props: { layout: "grid", images } };
}

const images: AlbumProps["images"] = [
  { url: "http://localhost:9000/hpwd/seed/album-1.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,AAA" },
  { url: "http://localhost:9000/hpwd/seed/album-2.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,BBB" },
  { url: "http://localhost:9000/hpwd/seed/album-3.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,CCC" },
];

describe("AlbumSection", () => {
  beforeEach(() => {
    lightboxSpy.mockClear();
  });

  it("renders null when there are no images", () => {
    const { container } = render(<AlbumSection section={albumSection([])} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders one image element per album image", () => {
    render(<AlbumSection section={albumSection(images)} />);

    expect(screen.getAllByRole("img")).toHaveLength(images.length);
  });

  it("opens the lightbox at the clicked image's index", () => {
    render(<AlbumSection section={albumSection(images)} />);

    // Closed initially.
    expect(lightboxSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }));

    fireEvent.click(screen.getAllByRole("img")[1]);

    expect(lightboxSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        index: 1,
        slides: images.map((image) => ({ src: image.url, width: image.width, height: image.height })),
      }),
    );
  });

  // Review fix (F): `slides` used to be rebuilt with a fresh `images.map(...)`
  // call inline on every render, including the re-renders triggered by
  // simply opening/navigating the lightbox (a `lightboxIndex` state change),
  // even though the underlying `images` list hadn't changed.
  it("keeps the slides array referentially stable across lightbox navigations", () => {
    render(<AlbumSection section={albumSection(images)} />);

    fireEvent.click(screen.getAllByRole("img")[0]);
    const firstSlides = lightboxSpy.mock.calls.at(-1)?.[0].slides;

    fireEvent.click(screen.getAllByRole("img")[1]);
    const secondSlides = lightboxSpy.mock.calls.at(-1)?.[0].slides;

    expect(firstSlides).toBe(secondSlides);
  });
});
