/**
 * Illustrated placeholder artwork for the demo invitation.
 *
 * The seed used to upload four flat pastel rectangles, which is why the
 * demo's album read as four coloured blocks and its arch portrait as an
 * empty tint. A demo is a sales page as much as a fixture, and flat blocks
 * undersell a product whose whole job is to look considered.
 *
 * These are DRAWN, not downloaded. Wedding photographs on other
 * invitation services are real couples' copyrighted pictures, and stock
 * libraries would mean an external fetch plus an attribution obligation
 * carried forever in a seed script. Vector botany rasterised by sharp has
 * neither problem, and it matches the ornaments the invitation itself
 * draws (`apps/web/src/components/invite/decor/Ornament.tsx`).
 *
 * These are still placeholders. A couple's real photographs are the one
 * thing this cannot invent, and the README says so.
 */

export interface ArtPalette {
  /** Top of the background gradient. */
  from: string
  /** Bottom of the background gradient. */
  to: string
  /** Stems, arch outline, bloom cores — the darkest tone. */
  ink: string
  /** Petals. */
  bloom: string
  /** Foliage. */
  leaf: string
}

/** Warm, wedding-appropriate, and distinguishable from each other at thumbnail size. */
export const ART_PALETTES: ArtPalette[] = [
  { from: '#F9E9E9', to: '#E7C2C6', ink: '#A8626D', bloom: '#D98F98', leaf: '#A9B49C' },
  { from: '#ECF1E9', to: '#CBDBCB', ink: '#6E8C76', bloom: '#AFC4A8', leaf: '#8AA189' },
  { from: '#F9F1E2', to: '#E9DDC2', ink: '#B2925F', bloom: '#DEC48C', leaf: '#AEB48C' },
  { from: '#EFE8F0', to: '#D4C7D9', ink: '#856F91', bloom: '#BCA5C4', leaf: '#9FAAA2' },
  { from: '#FAEDE3', to: '#EBCFBB', ink: '#B37A57', bloom: '#DDA983', leaf: '#AFAE8C' },
  { from: '#E7EDF3', to: '#C7D5E2', ink: '#6F88A2', bloom: '#A6BBD0', leaf: '#96A9A4' },
]

function petalRing(cx: number, cy: number, r: number, count: number, out: number, rx: number, ry: number, twist: number, fill: string) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i + twist
    return `<ellipse cx="0" cy="${(-r * out).toFixed(2)}" rx="${(r * rx).toFixed(2)}" ry="${(r * ry).toFixed(2)}" fill="${fill}" transform="rotate(${angle.toFixed(2)})"/>`
  }).join('')
}

/** Same three-ring construction the invitation's own `Ornament` uses, so the demo art and the live decoration are visibly the same hand. */
function bloom(cx: number, cy: number, r: number, p: ArtPalette, pale = false) {
  const petal = pale ? '#FFFFFF' : p.bloom
  const accent = pale ? '#F6F1EA' : p.from
  return (
    `<g transform="translate(${cx} ${cy})" opacity="0.95">` +
    petalRing(cx, cy, r, 9, 0.5, 0.26, 0.54, 0, petal) +
    petalRing(cx, cy, r, 7, 0.34, 0.22, 0.4, 24, accent) +
    petalRing(cx, cy, r, 5, 0.19, 0.17, 0.27, 48, petal) +
    `<circle r="${(r * 0.16).toFixed(2)}" fill="${p.ink}"/>` +
    `</g>`
  )
}

function leaf(x: number, y: number, angle: number, length: number, fill: string) {
  const w = length * 0.42
  return `<path d="M0 0Q${(length * 0.5).toFixed(1)} ${(-w).toFixed(1)} ${length} 0Q${(length * 0.5).toFixed(1)} ${w.toFixed(1)} 0 0Z" fill="${fill}" transform="translate(${x} ${y}) rotate(${angle})"/>`
}

/**
 * A spray rooted at (x, y). The drawn geometry grows up and to the right,
 * so `dirX`/`dirY` mirror it into whichever corner it is meant to occupy —
 * a top-right spray needs BOTH flips, which the first version missed, and
 * it grew straight off the top of the frame.
 *
 * Deterministic: the same arguments always produce the same art, so
 * re-running the seed overwrites the same objects with identical bytes.
 */
function spray(x: number, y: number, dirX: 1 | -1, dirY: 1 | -1, scale: number, p: ArtPalette) {
  const s = (n: number) => (n * scale).toFixed(1)
  const stems = [
    `M0 0C${s(40)} ${s(-14)} ${s(78)} ${s(-34)} ${s(112)} ${s(-64)}`,
    `M0 0C${s(30)} ${s(-34)} ${s(52)} ${s(-70)} ${s(64)} ${s(-110)}`,
    `M0 0C${s(46)} ${s(6)} ${s(88)} ${s(6)} ${s(126)} ${s(-2)}`,
  ]
    .map((d) => `<path d="${d}" fill="none" stroke="${p.ink}" stroke-opacity="0.5" stroke-width="${s(2)}" stroke-linecap="round"/>`)
    .join('')
  const leaves = [
    [38, -14, -22, 26],
    [70, -30, -28, 22],
    [26, -32, -58, 24],
    [48, -66, -66, 20],
    [44, 4, -6, 24],
    [88, 2, -4, 20],
  ]
    .map(([lx, ly, la, ll], i) => leaf(Number(s(lx)), Number(s(ly)), la, Number(s(ll)), i % 2 ? p.leaf : p.bloom))
    .join('')
  const blooms =
    bloom(Number(s(20)), Number(s(-12)), Number(s(32)), p) +
    bloom(Number(s(58)), Number(s(-50)), Number(s(22)), p, true) +
    bloom(Number(s(94)), Number(s(-58)), Number(s(17)), p) +
    bloom(Number(s(116)), Number(s(-8)), Number(s(14)), p, true) +
    bloom(Number(s(52)), Number(s(-96)), Number(s(13)), p) +
    bloom(Number(s(74)), Number(s(-14)), Number(s(11)), p, true)
  return `<g transform="translate(${x} ${y}) scale(${dirX} ${dirY})">${stems}${leaves}${blooms}</g>`
}

/**
 * The monogram is interpolated into SVG source, so it has to be escaped as
 * XML — the very first value tried, "K & H", made sharp fail with
 * "xmlParseEntityRef: no name". Callers pass couple initials, which for a
 * Vietnamese name can also carry diacritics; those are valid UTF-8 in SVG
 * and only the five markup characters need replacing.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface PlaceholderArtOptions {
  width: number
  height: number
  palette: ArtPalette
  /** Drawn centred when present. Used for the couple's portraits, left off for album frames. */
  monogram?: string
  /**
   * Draw the arch outline. On for album frames, OFF for anything that is
   * itself displayed inside the invitation's `ArchPortrait` — the cover
   * and the two couple photos — where a drawn arch inside a real arch
   * reads as a mistake rather than as a motif. `sprays` is the same
   * reasoning: that frame already hangs its own floral corners, so the
   * art underneath keeps only one small spray and does not compete.
   */
  arch?: boolean
  sprays?: 'full' | 'portrait'
}

/** The SVG source. Exported separately from the rasteriser so it can be asserted on without running sharp. */
export function placeholderArtSvg({
  width,
  height,
  palette,
  monogram,
  arch: drawArch = true,
  sprays = 'full',
}: PlaceholderArtOptions): string {
  const cx = width / 2
  // A round-topped arch inset from the frame — the same motif as the
  // invitation's watermark and its cover portrait, so the demo's photos
  // and its chrome agree with each other.
  const archW = width * 0.56
  const archTop = height * 0.16
  const archBottom = height * 0.9
  const r = archW / 2
  const arch = `M${cx - r} ${archBottom}V${archTop + r}a${r} ${r} 0 0 1 ${archW} 0V${archBottom}`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1">`,
    `<stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/>`,
    `</linearGradient>`,
    `<radialGradient id="vig" cx="0.5" cy="0.42" r="0.78">`,
    `<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.13"/>`,
    `</radialGradient>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    drawArch
      ? `<path d="${arch}" fill="none" stroke="${palette.ink}" stroke-opacity="0.28" stroke-width="${(width * 0.004).toFixed(2)}"/>`
      : '',
    drawArch
      ? `<path d="${arch}" fill="none" stroke="${palette.ink}" stroke-opacity="0.14" stroke-width="${(width * 0.002).toFixed(2)}" transform="translate(0 ${(height * 0.018).toFixed(1)}) scale(1 0.98)"/>`
      : '',
    monogram
      ? `<text x="${cx}" y="${(height * (drawArch ? 0.55 : 0.5)).toFixed(1)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${(width * 0.17).toFixed(1)}" letter-spacing="${(width * 0.012).toFixed(1)}" fill="${palette.ink}" fill-opacity="0.4">${escapeXml(monogram)}</text>`
      : '',
    /*
     * The spray's own coordinates live in a ~130-unit box, so the scale
     * divisor is what sets how much of the frame it covers — NOT the image
     * width. The first attempt divided by the width and produced sprigs a
     * seventh of the size intended, tucked invisibly into the corners.
     */
    spray(width * 0.03, height * 0.97, 1, 1, (width / 230) * (sprays === 'full' ? 1 : 0.72), palette),
    sprays === 'full' ? spray(width * 0.97, height * 0.03, -1, -1, (width / 230) * 0.62, palette) : '',
    `<rect width="${width}" height="${height}" fill="url(#vig)"/>`,
    `</svg>`,
  ].join('')
}
