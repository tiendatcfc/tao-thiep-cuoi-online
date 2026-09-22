import { ImageResponse } from "next/og";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { VN_TIME_ZONE } from "@/lib/date";
import { isAllowedImageUrl } from "@/lib/image-hosts";
import { loadOgHeadingFont, type OgHeadingFont } from "@/lib/og-font";
import { findCoverSection } from "@/lib/sections";

// Default (Node.js) runtime — deliberately NOT `export const runtime = "edge"`:
// this route needs Prisma, which doesn't run on the edge runtime.
export const alt = "Thiệp cưới";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FALLBACK_PRIMARY = "#A62B45";
const FALLBACK_BACKGROUND = "#FBF7F5";
const FALLBACK_GROOM_NAME = "Chú rể";
const FALLBACK_BRIDE_NAME = "Cô dâu";

interface OgContent {
  groomName: string;
  brideName: string;
  formattedDate: string | null;
  /** A `data:` URI (already-fetched bytes), never a remote URL — see `fetchCoverImageDataUri`. */
  coverImage: string | null;
  primary: string;
  background: string;
  /** `theme.headingFont`, so the card is set in the same face as the invitation it links to. */
  headingFont: string;
}

const FALLBACK_CONTENT: OgContent = {
  groomName: FALLBACK_GROOM_NAME,
  brideName: FALLBACK_BRIDE_NAME,
  formattedDate: null,
  coverImage: null,
  primary: FALLBACK_PRIMARY,
  background: FALLBACK_BACKGROUND,
  headingFont: "",
};

/**
 * See `CoverSection.formatVietnameseDate` for why `timeZone` is required,
 * not optional, in this Vietnam-only app. Exported (this route file
 * otherwise only exports the Next.js OG-image conventions above) so the B5
 * timezone-consistency test can exercise it directly without needing a real
 * DB row + full `ImageResponse` render.
 */
export function formatVietnameseDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIME_ZONE,
  }).format(date);
}

const IMAGE_FETCH_TIMEOUT_MS = 2000;
// Cover photos are user-uploaded via the editor's own upload flow (already
// size-limited there); this is a second, independent ceiling specifically
// for what this route is willing to inline as a base64 data URI — a very
// large image would bloat both the fetch and the resulting PNG's satori
// layout cost for no visual benefit at 1200x630.
const MAX_COVER_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Fetches the cover image exactly once and returns it as a `data:` URI, or
 * `null` on any failure (unreachable, non-OK, oversized, not allowlisted).
 * This used to be two separate fetches of the same URL: a reachability
 * probe here, then a second fetch by satori itself when rendering `<img
 * src={url}>`. That had two problems — a TOCTOU gap (the URL can stop
 * responding, expire, or hit a rate limit between the two fetches,
 * reproducing the exact washed-out-text bug a reachability-only probe was
 * meant to fix, just through a narrower window) and a wasted duplicate
 * download. Fetching once and handing satori the raw bytes (as a data URI,
 * which satori decodes locally without any network access — see the
 * compiled `@vercel/og` bundle's `vt()` image loader) removes both: there
 * is no second fetch to race against, and no duplicate bandwidth cost.
 *
 * SSRF guard (B4): the caller must already have checked `isAllowedImageUrl`
 * — this is the second layer, `redirect: "manual"` below, closing the
 * follow-up hole where an ALLOWLISTED url could still 30x an authenticated
 * couple's server-side request onward to an internal/link-local address
 * (e.g. the cloud metadata service). Node's `fetch` has no browser-style
 * public/private network restriction, so a followed redirect would just be
 * fetched like any other URL; `redirect: "manual"` makes any redirect
 * response come back as `ok: false` (an opaque `type: "opaqueredirect"`)
 * instead of being followed, and that's treated as an ordinary fetch
 * failure by the `!res.ok` branch right below.
 */
async function fetchCoverImageDataUri(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    if (!res.ok) {
      // Not consumed — drain it so the underlying connection can be
      // returned to the pool promptly instead of sitting open until GC.
      await res.body?.cancel().catch(() => {});
      return null;
    }

    // Cheap fast path: skip downloading the body at all when the server
    // honestly declares an oversized payload up front.
    const declaredLength = Number(res.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_IMAGE_BYTES) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    // Re-checked against the actual bytes regardless — a missing or
    // dishonest `content-length` header must not bypass the guard.
    if (buf.byteLength > MAX_COVER_IMAGE_BYTES) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Loads whatever this slug's published cover section has to offer for the
 * share-preview image. Never throws — any failure (missing slug, draft
 * status, corrupt `publishedDocument`, DB unreachable, cover image
 * unfetchable) degrades to `FALLBACK_CONTENT`/`null` so the route below
 * always has something renderable, matching `page.tsx`'s "must never take
 * the page down" stance for link-preview metadata.
 */
async function loadOgContent(slug: string): Promise<OgContent> {
  try {
    const invitation = await prisma.invitation.findUnique({ where: { slug } });
    if (!invitation || invitation.status !== "published" || !invitation.publishedDocument) {
      return FALLBACK_CONTENT;
    }

    const parsed = InvitationDocumentSchema.safeParse(invitation.publishedDocument);
    if (!parsed.success) return FALLBACK_CONTENT;

    const cover = findCoverSection(parsed.data.sections);
    const candidateImage = cover?.props.coverImage;
    // B4 SSRF guard: only ever fetch a cover image from the same hosts
    // `next.config.ts` allowlists for `/_next/image?url=` (local MinIO /
    // the configured R2 bucket) — every real cover image lives there
    // already (uploaded through the editor's own upload flow), so this
    // never affects a legitimate invitation, only a crafted `coverImage`
    // pointing at an arbitrary internal/external host.
    const coverImage =
      candidateImage && isAllowedImageUrl(candidateImage) ? await fetchCoverImageDataUri(candidateImage) : null;

    return {
      groomName: cover?.props.groomName || FALLBACK_GROOM_NAME,
      brideName: cover?.props.brideName || FALLBACK_BRIDE_NAME,
      formattedDate: cover?.props.date ? formatVietnameseDate(cover.props.date) : null,
      coverImage,
      primary: parsed.data.theme.primary || FALLBACK_PRIMARY,
      background: parsed.data.theme.background || FALLBACK_BACKGROUND,
      headingFont: parsed.data.theme.headingFont || "",
    };
  } catch (error) {
    console.error(`opengraph-image: failed to load content for slug=${slug}:`, error);
    return FALLBACK_CONTENT;
  }
}

/**
 * Cover photo (if any) as a full-bleed background with a dark overlay so the
 * white text stays legible over any photo; falls back to a flat brand-color
 * card when there's no usable cover photo.
 *
 * Font: `loadOgHeadingFont` (see `lib/og-font.ts`) loads the couple's own
 * heading family as a pair of self-hosted WOFF1 subsets — **not** the
 * `public/fonts/*.woff2` the site's CSS uses, which satori cannot parse at
 * all. `fontFamily` therefore names BOTH subsets, in latin-then-vietnamese
 * order, and this falls back to "whatever satori bundles" only when those
 * files are missing.
 *
 * Getting this right is a privacy fix, not a cosmetic one. satori's bundled
 * fallback is Noto Sans **latin**, which has no ế ặ ữ Đ; for any character
 * no registered font covers, it calls
 * `fonts.googleapis.com/css2?family=Noto+Sans&text=<those characters>` at
 * render time. That sent the couple's own name characters to Google on
 * every share render, from an app that otherwise makes no third-party
 * request at all — and rendered empty boxes whenever the call failed.
 * `opengraph-image.network.test.tsx` renders a Vietnamese name and asserts
 * zero outbound fetches.
 */
/**
 * The scrim that keeps the white name legible over an arbitrary cover
 * photo — a couple's photo can be any brightness, and without this the
 * text is white-on-pale.
 *
 * Every edge is given explicitly, and so are `width`/`height`, because
 * **satori does not implement the `inset` shorthand**. It silently ignores
 * the property rather than erroring, which left this element with no box
 * at all: the scrim was a no-op for as long as it has existed, and every
 * share image drew white text straight onto the photo. `inset: 0` renders
 * correctly in every browser, so nothing short of comparing the rendered
 * pixels would have caught it — which is what
 * `__tests__/opengraph-image.scrim.test.tsx` does.
 */
export const COVER_SCRIM_STYLE = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: `${size.width}px`,
  height: `${size.height}px`,
  display: "flex",
  backgroundColor: "rgba(20, 12, 14, 0.45)",
};

function renderCard(content: OgContent, includeCoverImage: boolean, fontFamily: string) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: content.background,
        fontFamily,
      }}
    >
      {includeCoverImage && content.coverImage ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- satori's own <img> (no Next Image / real DOM involved), purely decorative background
        <img
          src={content.coverImage}
          width={size.width}
          height={size.height}
          // `top`/`left` spelled out rather than `inset: 0` — satori ignores
          // the shorthand entirely; see `COVER_SCRIM_STYLE`.
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover", width: `${size.width}px`, height: `${size.height}px` }}
        />
      ) : null}
      {/* Only over a photo: on the flat brand-colour card the name is already the theme colour on its own background. */}
      {includeCoverImage && content.coverImage ? <div style={COVER_SCRIM_STYLE} /> : null}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "0 96px",
          textAlign: "center",
          color: includeCoverImage && content.coverImage ? "#ffffff" : content.primary,
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
          {content.groomName} &amp; {content.brideName}
        </div>
        {content.formattedDate ? (
          <div style={{ display: "flex", marginTop: 28, fontSize: 34 }}>{content.formattedDate}</div>
        ) : null}
      </div>
    </div>
  );
}

function renderBrandedFallback() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: FALLBACK_BACKGROUND,
        color: FALLBACK_PRIMARY,
        fontSize: 72,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      HPWD
    </div>
  );
}

function fontsOption(font: OgHeadingFont | null) {
  return font ? font.fonts : undefined;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Sequential, not `Promise.all`: which font file to read depends on the
  // document's `theme.headingFont`. The second step is a local file read
  // next to a DB round-trip, so there is nothing meaningful to overlap.
  const content = await loadOgContent(slug);
  const headingFont = await loadOgHeadingFont(content.headingFont);
  const fontFamily = headingFont ? headingFont.fontFamily : "sans-serif";
  const fonts = fontsOption(headingFont);

  // `loadOgContent` already fetched and validated `content.coverImage` (if
  // set) as real, already-decoded bytes (a data URI, not a remote URL), so
  // this is expected to succeed — the try/catch is defense-in-depth against
  // anything else going wrong in the render (an unsupported image format
  // satori's own decoder rejects, ...), falling back to the no-photo card
  // rather than letting it take down the whole OG image.
  if (content.coverImage) {
    try {
      return new ImageResponse(renderCard(content, true, fontFamily), { ...size, fonts });
    } catch (error) {
      console.error(`opengraph-image: cover image render failed for slug=${slug}:`, error);
    }
  }

  try {
    return new ImageResponse(renderCard(content, false, fontFamily), { ...size, fonts });
  } catch (error) {
    // Last-resort fallback: even the plain (no-photo) card failed to
    // render. This must still produce a valid image rather than a 500 —
    // an og:image tag pointing at an error page looks broken in every
    // chat app's link-preview UI.
    console.error(`opengraph-image: fallback render failed for slug=${slug}:`, error);
    return new ImageResponse(renderBrandedFallback(), { ...size });
  }
}
