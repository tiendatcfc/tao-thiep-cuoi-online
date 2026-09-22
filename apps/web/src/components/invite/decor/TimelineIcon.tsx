import type { TimelineIcon as TimelineIconName } from "@hpwd/schema";

/**
 * The small drawn marks beside a wedding-day schedule.
 *
 * Drawn, not emoji and not uploaded. An emoji renders as a different
 * picture on every phone — and as a black-and-white blob on several
 * Android builds, which is not what a couple wants beside "Lễ thành hôn".
 * An upload would be a third-party request on a page that deliberately
 * makes none. These are strokes, inherit `currentColor`, and therefore
 * work on the filled card and on paper without a second set.
 *
 * Deliberately a short list. A schedule needs about six marks; a hundred
 * would mean a picker nobody reads.
 */
const PATHS: Record<Exclude<TimelineIconName, "none">, string> = {
  // Two interlocking bands.
  rings: "M9 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM15 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM9 4V2h6v2",
  // Body, lens, viewfinder bump.
  camera: "M3 7h3l1.5-2h5L14 7h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  // Two tiers, a plate, a candle.
  cake: "M3 17h14M4 17v-4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4M6 12V9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M10 8V5M10 3v.5",
  // Two glasses tilted together.
  toast: "M5 3h4l-1 6a1 1 0 0 1-2 0L5 3ZM11 3h4l-1 6a1 1 0 0 1-2 0l-1-6M7 9v8M13 9v8M5 17h4M11 17h4",
  // Cab and wheels.
  car: "M3 13h14M4 13l1.5-4A1 1 0 0 1 6.5 8h7a1 1 0 0 1 1 .7L16 13M4 13v3M16 13v3M6.5 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM13.5 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  // A bloom on a stem.
  flower: "M10 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 9v9M10 13c-2 0-3.5-1.2-3.5-3M10 13c2 0 3.5-1.2 3.5-3",
  // A quaver.
  music: "M8 15V4l7-1.5V13M8 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM15 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
};

export function TimelineIcon({ name, size = 22 }: { name: TimelineIconName; size?: number }) {
  if (name === "none") return null;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
