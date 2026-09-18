// @vitest-environment jsdom
import type { AlbumProps, Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function albumSection(
  images: AlbumProps["images"],
  layout: AlbumProps["layout"] = "grid",
): Extract<Section, { type: "album" }> {
  const base = createSection("album") as Extract<Section, { type: "album" }>;
  return { ...base, props: { layout, images } };
}

const images: AlbumProps["images"] = [
  { url: "http://localhost:9000/hpwd/seed/album-1.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,AAA", caption: "" },
  { url: "http://localhost:9000/hpwd/seed/album-2.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,BBB", caption: "" },
  { url: "http://localhost:9000/hpwd/seed/album-3.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,CCC", caption: "" },
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

  // `await waitFor` rather than a synchronous assertion: `AlbumLightbox`
  // (the module `next/dynamic` now pulls in, carrying the Captions plugin
  // and both stylesheets) adds one more module hop before the mocked
  // library is reached, so the first call lands a microtask later than it
  // used to.
  it("opens the lightbox at the clicked image's index", async () => {
    render(<AlbumSection section={albumSection(images)} />);

    // Closed initially.
    await waitFor(() => expect(lightboxSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: false })));

    fireEvent.click(screen.getAllByRole("img")[1]);

    await waitFor(() =>
      expect(lightboxSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          open: true,
          index: 1,
          // A photo with no caption contributes no `description`, so the
          // slide is exactly the three fields it always was.
          slides: images.map((image) => ({ src: image.url, width: image.width, height: image.height })),
        }),
      ),
    );
  });

  // Review fix (F): `slides` used to be rebuilt with a fresh `images.map(...)`
  // call inline on every render, including the re-renders triggered by
  // simply opening/navigating the lightbox (a `lightboxIndex` state change),
  // even though the underlying `images` list hadn't changed.
  it("keeps the slides array referentially stable across lightbox navigations", async () => {
    render(<AlbumSection section={albumSection(images)} />);
    await waitFor(() => expect(lightboxSpy).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("img")[0]);
    const firstSlides = lightboxSpy.mock.calls.at(-1)?.[0].slides;

    fireEvent.click(screen.getAllByRole("img")[1]);
    const secondSlides = lightboxSpy.mock.calls.at(-1)?.[0].slides;

    expect(firstSlides).toBe(secondSlides);
  });

  it.each(["grid", "masonry", "carousel"] as const)(
    "renders the container for layout=%s with its distinguishing classes",
    (layout) => {
      const { container } = render(<AlbumSection section={albumSection(images, layout)} />);
      const el = container.querySelector(`[data-album-layout="${layout}"]`);
      expect(el).not.toBeNull();
      if (layout === "grid") expect(el?.className).toContain("grid-cols-2");
      if (layout === "masonry") expect(el?.className).toContain("columns-2");
      if (layout === "carousel") expect(el?.className).toContain("snap-x");
    },
  );

  it("opens the lightbox at the clicked index under the carousel layout too", async () => {
    render(<AlbumSection section={albumSection(images, "carousel")} />);
    fireEvent.click(screen.getAllByRole("img")[2]);
    await waitFor(() =>
      expect(lightboxSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, index: 2 })),
    );
  });

  it("never renders a layout container other than the selected one", () => {
    const { container } = render(<AlbumSection section={albumSection(images, "masonry")} />);
    expect(container.querySelectorAll("[data-album-layout]")).toHaveLength(1);
  });
});

/**
 * Phase 3 Task 2: per-photo captions and the `hero` layout. The basic
 * three layouts, the lightbox and the sharp pipeline shipped in Phase 1 —
 * this is the "nâng cao" half of spec feature 13.
 */
describe("AlbumSection — captions", () => {
  beforeEach(() => lightboxSpy.mockClear());

  function captioned(captions: string[], layout: AlbumProps["layout"] = "grid") {
    return albumSection(
      captions.map((caption, index) => ({ ...images[index % images.length], url: `http://cdn.test/${index}.jpg`, caption })),
      layout,
    );
  }

  it.each(["grid", "masonry", "carousel", "hero"] as const)("shows a caption under each photo in the %s layout", (layout) => {
    const { container } = render(<AlbumSection section={captioned(["Lễ ăn hỏi", "Chụp ngoại cảnh"], layout)} />);

    const captions = [...container.querySelectorAll("figcaption")].map((el) => el.textContent);
    expect(captions).toEqual(["Lễ ăn hỏi", "Chụp ngoại cảnh"]);
  });

  it("renders no figcaption for a photo with an empty caption", () => {
    // The overwhelmingly common case — an album of twenty photos where the
    // couple captioned two. Empty <figcaption> elements would put a blank
    // gap under every other tile.
    const { container } = render(<AlbumSection section={captioned(["", "Chỉ ảnh này", ""])} />);

    expect(container.querySelectorAll("figcaption")).toHaveLength(1);
    expect(container.querySelector("figcaption")?.textContent).toBe("Chỉ ảnh này");
  });

  it("strips control characters out of a caption before rendering it", () => {
    // Captions are plain text, never markup, so they go through
    // `sanitizePlainText` — the same treatment guest wishes get.
    const { container } = render(<AlbumSection section={captioned(["Lễ\u0000 ăn\u0007 hỏi"])} />);

    expect(container.querySelector("figcaption")?.textContent).toBe("Lễ ăn hỏi");
  });

  it("passes captions to the lightbox so they show full-screen too", async () => {
    render(<AlbumSection section={captioned(["Lễ ăn hỏi", ""])} />);
    await waitFor(() => expect(lightboxSpy).toHaveBeenCalled());

    const slides = lightboxSpy.mock.calls.at(-1)?.[0].slides;
    expect(slides[0].description).toBe("Lễ ăn hỏi");
    // An empty caption must not become an empty caption bar in the lightbox.
    expect(slides[1].description).toBeUndefined();
  });
});

describe("AlbumSection — hero layout", () => {
  beforeEach(() => lightboxSpy.mockClear());

  it("renders its own container and no other layout's", () => {
    const { container } = render(<AlbumSection section={albumSection(images, "hero")} />);

    expect(container.querySelector('[data-album-layout="hero"]')).not.toBeNull();
    for (const other of ["grid", "masonry", "carousel"]) {
      expect(container.querySelector(`[data-album-layout="${other}"]`)).toBeNull();
    }
  });

  it("shows every photo, with the first one marked as the hero", () => {
    const { container } = render(<AlbumSection section={albumSection(images, "hero")} />);

    expect(container.querySelectorAll("img")).toHaveLength(images.length);
    const hero = container.querySelectorAll("img[data-album-hero]");
    expect(hero).toHaveLength(1);
    expect(hero[0]).toHaveAttribute("alt", "Ảnh cưới 1");
  });

  it("works with a single photo — no empty grid underneath the hero", () => {
    const { container } = render(<AlbumSection section={albumSection([images[0]], "hero")} />);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("img[data-album-hero]")).toHaveLength(1);
  });

  it("opens the lightbox at the right index from the tiles below the hero", async () => {
    const { container } = render(<AlbumSection section={albumSection(images, "hero")} />);

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[2]);

    await waitFor(() =>
      expect(lightboxSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, index: 2 })),
    );
  });
});
