import type { CSSProperties } from "react";

/**
 * Floral corner sprays, drawn rather than fetched.
 *
 * The reference this design was modelled on decorates every card with
 * watercolour PNGs of deep-red peonies. They are beautiful and they are
 * also the reason that template only exists in one colourway: the moment a
 * couple picks sage or navy, hand-painted maroon flowers are wrong and
 * there is nothing the code can do about it. HPWD lets couples choose
 * `--primary`/`--secondary` freely, so the decoration has to be able to
 * follow them — which means vector shapes filled through `color-mix()`,
 * not pixels.
 *
 * The geometry is a fixed table, never `Math.random()`: the same reason
 * `PetalsOpening` spells its petals out. Randomising during render gives
 * the server and the client different markup and produces a hydration
 * mismatch, the class of bug this project has already hit three times.
 *
 * One spray is drawn, for the top-left corner, and the other three are it
 * mirrored — which is what printed stationery actually does, and costs one
 * `scale()` instead of four sets of paths.
 */

export type OrnamentCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** `scaleX`/`scaleY` per corner. The drawn spray emanates from the top-left of its own viewBox. */
const CORNER_TRANSFORM: Record<OrnamentCorner, string> = {
  "top-left": "scale(1, 1)",
  "top-right": "scale(-1, 1)",
  "bottom-left": "scale(1, -1)",
  "bottom-right": "scale(-1, -1)",
};

const CORNER_POSITION: Record<OrnamentCorner, CSSProperties> = {
  "top-left": { top: 0, left: 0 },
  "top-right": { top: 0, right: 0 },
  "bottom-left": { bottom: 0, left: 0 },
  "bottom-right": { bottom: 0, right: 0 },
};

/**
 * A bloom is built from two rings of rotated ellipses around a core rather
 * than from hand-drawn petal paths. At the 16–34px these render at, the
 * two are indistinguishable, and this version can be resized, recoloured
 * and re-proportioned by changing three numbers.
 */
function Bloom({ cx, cy, r, petal, core, accent }: { cx: number; cy: number; r: number; petal: string; core: string; accent: string }) {
  // Three rings, each offset from the one outside it and each alternating
  // two tones. The alternation is what reads as depth: a single-tone
  // rosette looks like a daisy sticker, and this has to sit next to real
  // photographs without looking like clip art.
  const rings = [
    { count: 9, ry: 0.54, rx: 0.26, out: 0.5, twist: 0 },
    { count: 7, ry: 0.4, rx: 0.22, out: 0.34, twist: 24 },
    { count: 5, ry: 0.27, rx: 0.17, out: 0.19, twist: 48 },
  ];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {rings.map((ring, ringIndex) =>
        Array.from({ length: ring.count }, (_, i) => {
          const angle = (360 / ring.count) * i + ring.twist;
          return (
            <ellipse
              key={`${ringIndex}-${i}`}
              cx={0}
              cy={-r * ring.out}
              rx={r * ring.rx}
              ry={r * ring.ry}
              fill={i % 2 === 0 ? petal : accent}
              transform={`rotate(${angle})`}
            />
          );
        }),
      )}
      <circle r={r * 0.15} fill={core} />
    </g>
  );
}

function Leaf({ x, y, angle, length, fill }: { x: number; y: number; angle: number; length: number; fill: string }) {
  // A pointed path, not an ellipse. An ellipse at this size reads as a
  // pill; two quadratic curves meeting at both tips read as a leaf, for
  // the same number of bytes.
  const w = length * 0.42;
  return (
    <path
      d={`M0 0Q${length * 0.5} ${-w} ${length} 0Q${length * 0.5} ${w} 0 0Z`}
      fill={fill}
      transform={`translate(${x} ${y}) rotate(${angle})`}
    />
  );
}

/**
 * Geometry, in the order it is painted: stems, then foliage, then blooms
 * on top.
 *
 * The arrangement is deliberate and it was wrong the first time. A corner
 * spray reads as a bouquet when the blooms CLUSTER at the corner and the
 * foliage radiates away from them into the card. The first attempt had it
 * the other way round — stems crossing the whole corner with blooms
 * scattered along them — and it read as scratches with stickers on.
 */
const STEMS = [
  "M30 30C48 34 62 42 80 50",
  "M28 34C36 52 44 68 52 86",
  "M34 26C50 20 66 16 86 14",
  "M22 38C20 54 18 68 14 84",
  "M26 22C34 14 42 9 52 5",
];

const LEAVES: { x: number; y: number; angle: number; length: number; light?: boolean }[] = [
  { x: 48, y: 36, angle: 22, length: 13 },
  { x: 62, y: 43, angle: 26, length: 11, light: true },
  { x: 73, y: 47, angle: 28, length: 9 },
  { x: 34, y: 44, angle: 68, length: 12, light: true },
  { x: 41, y: 60, angle: 72, length: 11 },
  { x: 47, y: 75, angle: 76, length: 9, light: true },
  { x: 50, y: 20, angle: -14, length: 12 },
  { x: 64, y: 17, angle: -9, length: 10, light: true },
  { x: 78, y: 15, angle: -6, length: 8 },
  { x: 21, y: 50, angle: 96, length: 11 },
  { x: 18, y: 66, angle: 99, length: 9, light: true },
  { x: 15, y: 78, angle: 101, length: 7 },
  { x: 36, y: 13, angle: -38, length: 10, light: true },
];

const BERRIES = [
  { cx: 86, cy: 54, r: 2.3 },
  { cx: 82, cy: 58, r: 1.6 },
  { cx: 55, cy: 90, r: 2.2 },
  { cx: 50, cy: 92, r: 1.5 },
  { cx: 90, cy: 12, r: 2 },
  { cx: 11, cy: 88, r: 1.9 },
  { cx: 56, cy: 3, r: 1.7 },
];

export interface OrnamentProps {
  corner: OrnamentCorner;
  /** Rendered width and height in px. The spray is square and scales as one. */
  size?: number;
  /** 0–1. Cards use a lower value than the open page, where the spray sits on bare paper. */
  opacity?: number;
  className?: string;
}

export function Ornament({ corner, size = 116, opacity = 1, className = "" }: OrnamentProps) {
  // Every fill goes through `color-mix` against the couple's own colours,
  // which is the whole point — see this file's docstring. The cream bloom
  // is mixed from `--background` rather than hardcoded white so it stays a
  // lighter version of THEIR paper.
  const petal = "color-mix(in oklab, var(--primary) 74%, white 26%)";
  const petalCore = "color-mix(in oklab, var(--primary) 72%, black 28%)";
  const petalAccent = "color-mix(in oklab, var(--primary) 88%, white 12%)";
  const creamPetal = "color-mix(in oklab, var(--background) 82%, white 18%)";
  const creamCore = "color-mix(in oklab, var(--secondary) 45%, var(--background))";
  const leaf = "color-mix(in oklab, var(--secondary) 76%, black 24%)";
  const leafLight = "color-mix(in oklab, var(--secondary) 58%, white 42%)";
  const stem = "color-mix(in oklab, var(--secondary) 66%, black 34%)";

  return (
    <span
      aria-hidden="true"
      data-ornament={corner}
      className={`pointer-events-none absolute block ${className}`.trim()}
      style={{ ...CORNER_POSITION[corner], width: size, height: size, opacity }}
    >
      <svg viewBox="0 0 96 96" width="100%" height="100%" focusable="false">
        <g transform={`translate(48 48) ${CORNER_TRANSFORM[corner]} translate(-48 -48)`}>
          {STEMS.map((d) => (
            <path key={d} d={d} fill="none" stroke={stem} strokeWidth={1.1} strokeLinecap="round" />
          ))}
          {LEAVES.map((l) => (
            <Leaf
              key={`${l.x}-${l.y}`}
              x={l.x}
              y={l.y}
              angle={l.angle}
              length={l.length}
              fill={l.light ? leafLight : leaf}
            />
          ))}
          {BERRIES.map((b) => (
            <circle key={`${b.cx}-${b.cy}`} cx={b.cx} cy={b.cy} r={b.r} fill={petalCore} />
          ))}
          {/* Cream blooms among the coloured ones: it is what makes a
              cluster read as an arrangement rather than as a blob. Painted
              first so the theme-coloured ones sit in front of them. */}
          <Bloom cx={38} cy={14} r={10} petal={creamPetal} core={creamCore} accent={creamPetal} />
          <Bloom cx={25} cy={50} r={8} petal={creamPetal} core={creamCore} accent={creamPetal} />
          <Bloom cx={43} cy={40} r={12} petal={petal} core={petalCore} accent={petalAccent} />
          <Bloom cx={11} cy={43} r={9} petal={petal} core={petalCore} accent={petalAccent} />
          <Bloom cx={22} cy={25} r={16} petal={petal} core={petalCore} accent={petalAccent} />
        </g>
      </svg>
    </span>
  );
}
