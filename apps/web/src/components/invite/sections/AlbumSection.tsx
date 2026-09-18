"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AlbumProps, Section } from "@hpwd/schema";
import Image from "next/image";
import dynamic from "next/dynamic";
import { sanitizePlainText } from "@/lib/sanitize";
import { SectionWrapper } from "./SectionWrapper";

// Loaded on demand instead of statically: the lightbox modal is invisible
// (`open={false}`) until a guest actually taps a photo, so its JS has no
// business being in the bundle every `/i/[slug]` visitor's browser must
// parse/execute before the page's first paint. `ssr: false` because it has
// nothing to contribute server-side either — closed, it renders nothing.
// Measured via Lighthouse mobile (Task 19): this was one of the larger
// chunks in `/i/demo`'s initial JS. `AlbumLightbox` also carries the
// Captions plugin and both stylesheets, for the same reason.
const Lightbox = dynamic(() => import("./AlbumLightbox"), { ssr: false });

type AlbumImage = AlbumProps["images"][number];

/**
 * One photo: the tap target, plus its caption underneath when it has one.
 *
 * `<figure>`/`<figcaption>` rather than a caption inside the button —
 * grid and carousel tiles clip their overflow to hold a fixed aspect ratio,
 * so a caption inside would be cropped away, and a caption is a label for
 * the image rather than part of the control that opens it.
 *
 * Captions are plain text, never markup, so they go through
 * `sanitizePlainText` — the same treatment guest wishes get — and an empty
 * one renders no element at all rather than an empty gap under the tile.
 */
function AlbumTile({
  image,
  index,
  onOpen,
  buttonClassName,
  figureClassName = "",
  children,
}: {
  image: AlbumImage;
  index: number;
  onOpen: (index: number) => void;
  buttonClassName: string;
  figureClassName?: string;
  children: ReactNode;
}) {
  const caption = sanitizePlainText(image.caption).trim();

  return (
    <figure className={figureClassName}>
      <button type="button" onClick={() => onOpen(index)} className={buttonClassName}>
        {children}
      </button>
      {caption ? (
        <figcaption className="mt-1 px-0.5 text-center text-xs text-gray-500">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Album: renders whichever of the four layouts the editor's `AlbumPanel`
 * saved onto `section.props.layout` — `grid` (fixed 2-col square tiles,
 * `fill` + `object-cover`), `masonry` (CSS columns, intrinsic aspect ratio
 * per photo), `carousel` (horizontal scroll-snap) or `hero` (one full-width
 * feature photo above a 3-column strip). Tapping a photo in any layout
 * opens it full-screen in `yet-another-react-lightbox`, seeked to the
 * tapped photo's index — the layouts share one click handler and one
 * memoized `slides` array; only the tile markup/CSS differs.
 *
 * Renders nothing when there are no images, same as `GiftSection` with no
 * accounts configured — an empty album shouldn't occupy page real estate.
 */
export function AlbumSection({ section }: { section: Extract<Section, { type: "album" }> }) {
  const { images, layout } = section.props;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Recomputed only when the image list itself changes, not on every
  // lightbox open/close/navigate (which just moves `lightboxIndex`).
  const slides = useMemo(
    () =>
      images.map((image) => {
        const caption = sanitizePlainText(image.caption).trim();
        return {
          src: image.url,
          width: image.width,
          height: image.height,
          // Left off entirely when absent: an empty string would still open
          // the plugin's caption bar over the photo, with nothing in it.
          ...(caption ? { description: caption } : {}),
        };
      }),
    [images],
  );

  if (images.length === 0) return null;

  const [hero, ...rest] = images;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Album ảnh</h2>
      {layout === "grid" && (
        <div data-album-layout="grid" className="grid w-full grid-cols-2 gap-2">
          {images.map((image, index) => (
            <AlbumTile
              // Images have no stable id in the schema (whole-list replace from
              // the editor); url is unique in practice (distinct storage keys).
              key={image.url}
              image={image}
              index={index}
              onOpen={setLightboxIndex}
              // Fixed square tiles regardless of each photo's native aspect
              // ratio — `fill` + `object-cover` inside a sized/clipped
              // container, rather than intrinsic width/height + `object-cover`
              // (a contradictory combo: `h-auto` lets the element take its
              // natural height, so `object-cover` never has any overflow to
              // crop, and grid rows end up ragged). The full, uncropped photo
              // still opens in the lightbox via `slides`.
              buttonClassName="relative block aspect-square w-full overflow-hidden rounded-lg"
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
            </AlbumTile>
          ))}
        </div>
      )}
      {layout === "masonry" && (
        <div data-album-layout="masonry" className="w-full columns-2 gap-2">
          {images.map((image, index) => (
            <AlbumTile
              key={image.url}
              image={image}
              index={index}
              onOpen={setLightboxIndex}
              figureClassName="mb-2 break-inside-avoid"
              // No `aspect-*`/`overflow-hidden` clip here on purpose — unlike
              // the grid tile above, masonry wants each photo's *natural*
              // aspect ratio to create the staggered "brick wall" look, so
              // the image is sized intrinsically (`width`/`height`, schema
              // guarantees positive ints) rather than `fill` + `object-cover`.
              buttonClassName="block w-full overflow-hidden rounded-lg"
            >
              <Image
                src={image.url}
                alt={`Ảnh cưới ${index + 1}`}
                width={image.width}
                height={image.height}
                sizes="(max-width: 430px) 50vw, 215px"
                placeholder={image.blurDataUrl ? "blur" : "empty"}
                blurDataURL={image.blurDataUrl || undefined}
                className="h-auto w-full"
                loading="lazy"
              />
            </AlbumTile>
          ))}
        </div>
      )}
      {layout === "carousel" && (
        <div
          data-album-layout="carousel"
          className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto"
        >
          {images.map((image, index) => (
            <AlbumTile
              key={image.url}
              image={image}
              index={index}
              onOpen={setLightboxIndex}
              figureClassName="w-4/5 shrink-0 snap-center"
              // Wide fixed-ratio tiles that snap to center as the guest
              // swipes/scrolls horizontally — `fill` + `object-cover` again,
              // same reasoning as the grid tile: a stable crop per slot
              // rather than each photo's native (and possibly very tall or
              // very wide) aspect ratio dictating the tile's size.
              buttonClassName="relative block aspect-[3/4] w-full overflow-hidden rounded-lg"
            >
              <Image
                src={image.url}
                alt={`Ảnh cưới ${index + 1}`}
                fill
                sizes="(max-width: 430px) 80vw, 344px"
                placeholder={image.blurDataUrl ? "blur" : "empty"}
                blurDataURL={image.blurDataUrl || undefined}
                className="object-cover"
                loading="lazy"
              />
            </AlbumTile>
          ))}
        </div>
      )}
      {layout === "hero" && (
        <div data-album-layout="hero" className="flex w-full flex-col gap-2">
          <AlbumTile
            key={hero.url}
            image={hero}
            index={0}
            onOpen={setLightboxIndex}
            figureClassName="w-full"
            buttonClassName="relative block aspect-[4/5] w-full overflow-hidden rounded-lg"
          >
            {/* The one photo the couple wants seen first: full width, tall
                crop, and `priority` because in this layout it is the section's
                largest element and a likely LCP candidate — the other tiles
                stay lazy. */}
            <Image
              src={hero.url}
              alt="Ảnh cưới 1"
              data-album-hero=""
              fill
              sizes="(max-width: 430px) 100vw, 430px"
              placeholder={hero.blurDataUrl ? "blur" : "empty"}
              blurDataURL={hero.blurDataUrl || undefined}
              className="object-cover"
            />
          </AlbumTile>
          {rest.length > 0 ? (
            <div className="grid w-full grid-cols-3 gap-2">
              {rest.map((image, index) => (
                <AlbumTile
                  key={image.url}
                  image={image}
                  // +1: `rest` is the list minus the hero, but the lightbox
                  // indexes the full `images` array.
                  index={index + 1}
                  onOpen={setLightboxIndex}
                  buttonClassName="relative block aspect-square w-full overflow-hidden rounded-lg"
                >
                  <Image
                    src={image.url}
                    alt={`Ảnh cưới ${index + 2}`}
                    fill
                    sizes="(max-width: 430px) 33vw, 143px"
                    placeholder={image.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={image.blurDataUrl || undefined}
                    className="object-cover"
                    loading="lazy"
                  />
                </AlbumTile>
              ))}
            </div>
          ) : null}
        </div>
      )}
      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={slides}
      />
    </SectionWrapper>
  );
}
