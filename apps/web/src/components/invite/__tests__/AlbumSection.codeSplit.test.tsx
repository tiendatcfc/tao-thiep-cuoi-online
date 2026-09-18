// @vitest-environment jsdom
import type { AlbumProps, Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlbumSection } from "../sections/AlbumSection";

// Deliberately its own file, not folded into AlbumSection.test.tsx: the
// assertion below only holds on the very *first* render of `AlbumSection`'s
// module-level `Lightbox` (a `next/dynamic(..., { ssr: false })` value,
// itself a `React.lazy` wrapped in `Suspense`) within a given module
// instance. Once that lazy import resolves once, every later render in the
// same module registry sees it already resolved and calls through
// synchronously — verified by hand while writing this test: a second
// `render()` in the same file saw the mock invoked synchronously with no
// `waitFor` at all. Vitest gives each test *file* a fresh module registry
// by default, so keeping this the sole test in its own file (rather than
// adding it to `AlbumSection.test.tsx`, which renders `AlbumSection`
// several times) is what makes the "not called yet" assertion below
// reliable rather than order-dependent.
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
  { url: "http://localhost:9000/hpwd/seed/album-1.jpg", width: 800, height: 600, blurDataUrl: "data:image/webp;base64,AAA", caption: "" },
];

describe("AlbumSection — lightbox is code-split (Task 19 Lighthouse fix)", () => {
  it("does not call into yet-another-react-lightbox synchronously on mount — it's dynamically imported, not statically bundled", async () => {
    render(<AlbumSection section={albumSection(images)} />);

    // A static `import Lightbox from "yet-another-react-lightbox"` would
    // have called this synchronously, in the same tick as `render()` —
    // confirmed by hand: temporarily reverting `AlbumSection.tsx` to a
    // static import makes this exact assertion fail (the mock IS called,
    // with `open: false`, before this line runs). The `next/dynamic(...,
    // { ssr: false })` wrapper instead renders `Suspense`'s `null`
    // fallback first and only calls through once the dynamic `import()`
    // resolves, which takes at least one microtask tick.
    expect(lightboxSpy).not.toHaveBeenCalled();

    // It does still load and render shortly after — this isn't testing
    // that the library never loads, only that it isn't on the critical
    // synchronous render path.
    await waitFor(() => expect(lightboxSpy).toHaveBeenCalledWith(expect.objectContaining({ open: false })));
  });
});
