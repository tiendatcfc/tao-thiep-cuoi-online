"use client";

import { useState } from "react";
import type { Section } from "@hpwd/schema";
import Image from "next/image";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { SectionWrapper } from "./SectionWrapper";

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
            className="block"
          >
            <Image
              src={image.url}
              alt={`Ảnh cưới ${index + 1}`}
              width={image.width}
              height={image.height}
              sizes="(max-width: 430px) 50vw, 215px"
              placeholder={image.blurDataUrl ? "blur" : "empty"}
              blurDataURL={image.blurDataUrl || undefined}
              className="h-auto w-full rounded-lg object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={images.map((image) => ({ src: image.url, width: image.width, height: image.height }))}
      />
    </SectionWrapper>
  );
}
