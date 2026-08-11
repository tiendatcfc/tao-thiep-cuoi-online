import { ImageResponse } from "next/og";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";

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

function findCoverSection(sections: Section[]): Extract<Section, { type: "cover" }> | null {
  return sections.find((section): section is Extract<Section, { type: "cover" }> => section.type === "cover") ?? null;
}

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

const IMAGE_REACHABILITY_TIMEOUT_MS = 2000;

/**
 * Satori (the renderer behind `ImageResponse`) fetches `<img src>` itself
 * during layout, but — verified empirically, see the Task 17 report —
 * it swallows a failed fetch internally (logs and treats it as "no image")
 * rather than throwing, and `ImageResponse`'s constructor itself never
 * throws synchronously either (it defers all rendering into a lazily-read
 * `ReadableStream`). That means a `try/catch` around `new ImageResponse(...)`
 * can NOT detect a dead cover-image URL — by the time any error would
 * surface, this function has already returned a response, and satori has
 * already silently rendered the "photo" layer as blank while still applying
 * the white-text-on-dark-overlay treatment meant for an actual photo,
 * producing washed-out, barely-legible text instead of the intended
 * fallback. So reachability has to be checked proactively, before deciding
 * whether to render the photo variant at all, not reactively after a
 * satori render that won't actually fail loudly.
 */
async function isImageReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_REACHABILITY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Loads whatever this slug's published cover section has to offer for the
 * share-preview image. Never throws — any failure (missing slug, draft
 * status, corrupt `publishedDocument`, DB unreachable) degrades to
 * `FALLBACK_CONTENT` so the route below always has something renderable,
 * matching `page.tsx`'s "must never take the page down" stance for
 * link-preview metadata.
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
      candidateImage && isAbsoluteHttpUrl(candidateImage) && (await isImageReachable(candidateImage))
        ? candidateImage
        : null;

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
 * card when there's no usable cover photo. `next/font/google` is unusable in
 * this environment (see `public/fonts/README.md`) and no self-hosted
 * WOFF/TTF files exist yet either, so this intentionally passes no `fonts`
 * option — satori/`ImageResponse` render with their bundled default font.
 * Vietnamese diacritics are NOT fully covered by that default (verified by
 * rendering — see the Task 17 report), so this is a known, documented
 * limitation until self-hosted fonts land, not a silent bug.
 */
function renderCard(content: OgContent, includeCoverImage: boolean) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: content.background,
        fontFamily: "sans-serif",
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

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await loadOgContent(slug);

  // `loadOgContent` already confirmed `content.coverImage` (if set) responded
  // OK to a real fetch, so this is expected to succeed — the try/catch is
  // just defense-in-depth against anything else going wrong in the render
  // (a transient failure on satori's own re-fetch of the same URL a moment
  // later, an unsupported image format, ...), falling back to the no-photo
  // card rather than letting it take down the whole OG image.
  if (content.coverImage) {
    try {
      return new ImageResponse(renderCard(content, true), { ...size });
    } catch (error) {
      console.error(`opengraph-image: cover image render failed for slug=${slug}:`, error);
    }
  }

  try {
    return new ImageResponse(renderCard(content, false), { ...size });
  } catch (error) {
    // Last-resort fallback: even the plain (no-photo) card failed to
    // render. This must still produce a valid image rather than a 500 —
    // an og:image tag pointing at an error page looks broken in every
    // chat app's link-preview UI.
    console.error(`opengraph-image: fallback render failed for slug=${slug}:`, error);
    return new ImageResponse(renderBrandedFallback(), { ...size });
  }
}
