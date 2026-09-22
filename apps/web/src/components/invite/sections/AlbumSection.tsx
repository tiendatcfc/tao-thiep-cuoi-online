"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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
 * The carousel layout: a peek carousel, not a filmstrip.
 *
 * Each slide is 76% of the column and snaps to centre, so the neighbours
 * on both sides show an edge — which is the whole point. A strip of
 * full-width slides gives a guest no reason to believe there is anything
 * to the right of what they are looking at, and most never swipe. The
 * dots say how many there are and how far in they have got.
 *
 * `-mx-[var(--gutter)]` with matching scroll padding: the strip runs the
 * full width of the column so the peeking neighbours are not clipped at
 * the section's gutter, while the centred slide still lines up with every
 * other section's measure.
 *
 * The dots are real buttons, not decoration. `scrollIntoView` on the slide
 * is one line and makes the carousel usable by anyone who cannot swipe;
 * the scroll position is read back on scroll so the dots follow a swipe
 * too.
 */
function AlbumCarousel({
  images,
  onOpen,
}: {
  images: AlbumImage[];
  onOpen: (index: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const slides = [...strip.children] as HTMLElement[];
    if (slides.length === 0) return;
    // Nearest slide centre to the viewport centre, rather than
    // `scrollLeft / slideWidth`: the slides carry scroll padding and a
    // gap, so dividing by a width drifts by a whole slide near the end.
    const centre = strip.scrollLeft + strip.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - centre);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActive(nearest);
  }, []);

  function goTo(index: number) {
    const slide = stripRef.current?.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        ref={stripRef}
        onScroll={handleScroll}
        data-album-layout="carousel"
        className="-mx-[var(--gutter)] flex w-[calc(100%+2*var(--gutter))] snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-[12%] px-[12%] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image, index) => (
          <AlbumTile
            key={image.url}
            image={image}
            index={index}
            onOpen={onOpen}
            figureClassName="w-[76%] shrink-0 snap-center"
            // A stable crop per slot rather than each photo's native (and
            // possibly very tall or very wide) aspect ratio dictating the
            // slide's size. The full, uncropped photo still opens in the
            // lightbox.
            buttonClassName="relative block aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-card)]"
          >
            <Image
              src={image.url}
              alt={`Ảnh cưới ${index + 1}`}
              fill
              sizes="(max-width: 430px) 76vw, 327px"
              placeholder={image.blurDataUrl ? "blur" : "empty"}
              blurDataURL={image.blurDataUrl || undefined}
              className="object-cover"
              loading="lazy"
            />
          </AlbumTile>
        ))}
      </div>

      {images.length > 1 ? (
        <div role="group" aria-label="Chọn ảnh" className="flex items-center justify-center gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Ảnh ${index + 1}`}
              aria-current={index === active ? "true" : undefined}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === active ? 18 : 6,
                backgroundColor:
                  index === active
                    ? "var(--primary)"
                    : "color-mix(in oklab, var(--primary) 26%, transparent)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
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
        <AlbumCarousel images={images} onOpen={setLightboxIndex} />
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
