import Image from "next/image";
import { Ornament } from "./Ornament";

/**
 * A photograph in an arch.
 *
 * An arch is the oldest wedding motif there is, it is the shape the page's
 * own watermark repeats, and — unlike the circle this replaced — it suits a
 * portrait crop, which is what wedding photographs are. Two concentric
 * arches: the photo's own frame and a hairline sitting outside it, which is
 * the detail that makes it read as printed rather than as a CSS shape.
 *
 * With no photo the arch is not empty. `createDefaultDocument` ships
 * without any images and plenty of couples never add one, so the fallback
 * is a tinted arch carrying an initial or two — a designed absence instead
 * of a missing element.
 *
 * Shared by the cover (large, ornamented, `priority`) and by each half of
 * the couple section (small, plain, lazy), because two different arches
 * drawn two different ways on the same page would read as a mistake.
 */
export interface ArchPortraitProps {
  src: string;
  alt: string;
  /** Drawn in the arch when there is no photo. */
  fallbackText: string;
  /** Rendered width in px. The arch is 1.27:1 tall. */
  width: number;
  /** Hangs floral sprays on two corners. Off for the smaller portraits, where they would crowd the name underneath. */
  ornamented?: boolean;
  /**
   * `true` for the cover's arch only: on an invitation that has a cover
   * photo it is the largest element above the fold and therefore the LCP
   * candidate. `fetchPriority` has to be passed explicitly because Next
   * 15.5 puts it on neither the preload link nor the `<img>`.
   */
  priority?: boolean;
}

export function ArchPortrait({
  src,
  alt,
  fallbackText,
  width,
  ornamented = false,
  priority = false,
}: ArchPortraitProps) {
  const height = Math.round(width * 1.27);

  return (
    <span className="relative block" style={{ width, height }}>
      <span
        aria-hidden="true"
        className="absolute -inset-2.5 block rounded-t-full border"
        style={{ borderColor: "color-mix(in oklab, var(--primary) 26%, transparent)" }}
      />
      {ornamented ? (
        <>
          <Ornament corner="top-left" size={Math.round(width * 0.4)} opacity={0.9} className="-m-6 z-10" />
          <Ornament corner="bottom-right" size={Math.round(width * 0.4)} opacity={0.9} className="-m-6 z-10" />
        </>
      ) : null}
      <span
        className="relative block h-full w-full overflow-hidden rounded-t-full"
        style={{
          boxShadow: "var(--shadow-lift)",
          backgroundImage:
            "linear-gradient(170deg, color-mix(in oklab, var(--secondary) 45%, white) 0%, color-mix(in oklab, var(--secondary) 80%, var(--primary) 12%) 100%)",
        }}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            // The CSS box, exactly: a hint larger than the box makes the
            // optimizer serve a file nobody needs, smaller makes it serve a
            // blurry one.
            sizes={`${width}px`}
            priority={priority}
            {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
            className="object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-end justify-center"
            style={{
              fontFamily: "var(--font-heading, inherit)",
              fontSize: `${Math.round(width * 0.19)}px`,
              paddingBottom: `${Math.round(width * 0.17)}px`,
              color: "color-mix(in oklab, var(--primary) 70%, white 30%)",
              letterSpacing: "0.08em",
            }}
          >
            {fallbackText}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The first letter of a Vietnamese GIVEN name, which is the last word of
 * the full name ("Nguyễn Hoàng Nam" → "N"). `toLocaleUpperCase("vi")`
 * rather than `toUpperCase()` so a name beginning with đ/ơ/ư uppercases
 * correctly. Same rule as the opening gate's seal.
 */
export function givenInitial(name: string): string {
  const given = name.trim().split(/\s+/).at(-1) ?? "";
  return Array.from(given)[0]?.toLocaleUpperCase("vi") ?? "";
}
