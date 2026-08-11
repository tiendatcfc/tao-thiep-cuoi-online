import { ImageResponse } from "next/og";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { loadOgHeadingFont, OG_HEADING_FONT_NAME, type OgFontDescriptor } from "@/lib/og-font";
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
}

const FALLBACK_CONTENT: OgContent = {
  groomName: FALLBACK_GROOM_NAME,
  brideName: FALLBACK_BRIDE_NAME,
  formattedDate: null,
  coverImage: null,
  primary: FALLBACK_PRIMARY,
  background: FALLBACK_BACKGROUND,
};

function formatVietnameseDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
 * `null` on any failure (unreachable, non-OK, oversized). This used to be
 * two separate fetches of the same URL: a reachability probe here, then a
 * second fetch by satori itself when rendering `<img src={url}>`. That had
 * two problems — a TOCTOU gap (the URL can stop responding, expire, or hit
 * a rate limit between the two fetches, reproducing the exact
 * washed-out-text bug a reachability-only probe was meant to fix, just
 * through a narrower window) and a wasted duplicate download. Fetching once
 * and handing satori the raw bytes (as a data URI, which satori decodes
 * locally without any network access — see the compiled `@vercel/og`
 * bundle's `vt()` image loader) removes both: there is no second fetch to
 * race against, and no duplicate bandwidth cost.
 */
async function fetchCoverImageDataUri(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
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
    const coverImage =
      candidateImage && isAbsoluteHttpUrl(candidateImage) ? await fetchCoverImageDataUri(candidateImage) : null;

    return {
      groomName: cover?.props.groomName || FALLBACK_GROOM_NAME,
      brideName: cover?.props.brideName || FALLBACK_BRIDE_NAME,
      formattedDate: cover?.props.date ? formatVietnameseDate(cover.props.date) : null,
      coverImage,
      primary: parsed.data.theme.primary || FALLBACK_PRIMARY,
      background: parsed.data.theme.background || FALLBACK_BACKGROUND,
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
 * Font: no self-hosted WOFF/TTF files existed at all when this route was
 * first written, so it rendered with satori's bundled default font (no
 * Vietnamese diacritic coverage). `loadOgHeadingFont` (see `lib/og-font.ts`)
 * now checks for a self-hosted TTF/WOFF1 copy — **not** the WOFF2 files
 * `public/fonts/*.woff2` used by the site's own CSS, which satori cannot
 * parse at all — and this falls back to the exact same "sans-serif,
 * whatever satori bundles" behavior as before whenever that file doesn't
 * exist yet (or isn't a format satori can read). Vietnamese diacritics stay
 * incomplete until that TTF/WOFF1 file actually exists — see the Task 17
 * report for what that looks like today.
 */
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
          style={{ position: "absolute", inset: 0, objectFit: "cover", width: `${size.width}px`, height: `${size.height}px` }}
        />
      ) : null}
      <div style={{ position: "absolute", inset: 0, display: "flex", backgroundColor: "rgba(20, 12, 14, 0.45)" }} />
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

function fontsOption(font: OgFontDescriptor | null) {
  return font ? [font] : undefined;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [content, headingFont] = await Promise.all([loadOgContent(slug), loadOgHeadingFont()]);
  const fontFamily = headingFont ? OG_HEADING_FONT_NAME : "sans-serif";
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
