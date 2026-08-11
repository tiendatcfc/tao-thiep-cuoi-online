"use client";

import { useMemo, useState } from "react";
import type { Section } from "@hpwd/schema";
import Image from "next/image";
import dynamic from "next/dynamic";
import "yet-another-react-lightbox/styles.css";
import { SectionWrapper } from "./SectionWrapper";

// Loaded on demand instead of statically: the lightbox modal is invisible
// (`open={false}`) until a guest actually taps a photo, so its JS has no
// business being in the bundle every `/i/[slug]` visitor's browser must
// parse/execute before the page's first paint. `ssr: false` because it has
// nothing to contribute server-side either — closed, it renders nothing.
// Measured via Lighthouse mobile (Task 19): this was one of the larger
// chunks in `/i/demo`'s initial JS.
const Lightbox = dynamic(() => import("yet-another-react-lightbox"), { ssr: false });

/**
 * Phase-1 album: a fixed 2-column grid (no masonry/carousel layout yet —
 * `section.props.layout` is read back by the editor but not branched on
 * here until Phase 3). Tapping a photo opens it full-screen in
 * `yet-another-react-lightbox`, seeked to the tapped photo's index.
 *
 * Renders nothing when there are no images, same as `GiftSection` with no
 * accounts configured — an empty album shouldn't occupy page real estate.
 */
export function AlbumSection({ section }: { section: Extract<Section, { type: "album" }> }) {
  const { images } = section.props;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Recomputed only when the image list itself changes, not on every
  // lightbox open/close/navigate (which just moves `lightboxIndex`).
  const slides = useMemo(
    () => images.map((image) => ({ src: image.url, width: image.width, height: image.height })),
    [images],
  );

  if (images.length === 0) return null;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Album ảnh</h2>
      <div className="grid w-full grid-cols-2 gap-2">
        {images.map((image, index) => (
          <button
            // Images have no stable id in the schema (whole-list replace from
            // the editor); url is unique in practice (distinct storage keys).
            key={image.url}
            type="button"
            onClick={() => setLightboxIndex(index)}
            // Fixed square tiles regardless of each photo's native aspect
            // ratio — `fill` + `object-cover` inside a sized/clipped
            // container, rather than intrinsic width/height + `object-cover`
            // (a contradictory combo: `h-auto` lets the element take its
            // natural height, so `object-cover` never has any overflow to
            // crop, and grid rows end up ragged). The full, uncropped photo
            // still opens in the lightbox via `slides`.
            className="relative block aspect-square overflow-hidden rounded-lg"
          >
            <Image
              src={image.url}
              alt={`Ảnh cưới ${index + 1}`}
              fill
              sizes="(max-width: 430px) 50vw, 215px"
              placeholder={image.blurDataUrl ? "blur" : "empty"}
              blurDataURL={image.blurDataUrl || undefined}
              className="object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={slides}
      />
    </SectionWrapper>
  );
}
