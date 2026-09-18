import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { prisma } from "@hpwd/db";
import { InvitePage } from "@/components/invite/InvitePage";
import { findCoverSection } from "@/lib/sections";
import { parseInvitationSettings } from "@/lib/settings";

const DEFAULT_TAGLINE = "Trân trọng kính mời bạn đến dự lễ cưới của chúng tôi.";

/**
 * Next runs `generateMetadata` and the page component for the SAME request,
 * and both need the same invitation row. They each used to issue their own
 * `findUnique`, so every guest opening an invitation cost two identical
 * queries — 600 for a wedding whose 300 guests all open the link, for 300
 * rows' worth of data.
 *
 * `cache()` is React's per-request memo: the second caller in the same
 * request gets the first one's promise instead of a second round trip. It
 * is scoped to the request, so two different guests still each get a fresh
 * read — this is deduplication, not caching, and nothing here can go stale
 * between the metadata pass and the render.
 *
 * The historical-slug lookup gets the same treatment: on a 404-or-redirect
 * path both passes ask for it too.
 */
const loadInvitationBySlug = cache((slug: string) => prisma.invitation.findUnique({ where: { slug } }));

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * `slug` doesn't match any invitation's CURRENT slug — but a couple that
 * published under it before moving to a different one still has it in
 * `InvitationSlug` forever (Phase 1 Hardening Task 2). If that invitation is
 * still published, returns its current slug so the caller can permanently
 * redirect every link already handed out under the old slug instead of
 * 404ing it on the wedding day. Returns `null` for "really doesn't exist"
 * AND for "belongs to an invitation that isn't published (any more)" —
 * redirecting to an unpublished document would reveal its existence/content,
 * which a plain 404 must not do.
 */
const findCurrentSlugForHistoricalSlug = cache(async function findCurrentSlugForHistoricalSlug(
  slug: string,
): Promise<string | null> {
  const historical = await prisma.invitationSlug.findUnique({
    where: { slug },
    include: { invitation: { select: { slug: true, status: true } } },
  });
  if (!historical || historical.invitation.status !== "published" || historical.invitation.slug === slug) {
    return null;
  }
  return historical.invitation.slug;
});

/**
 * Builds the redirect target for a historical slug, carrying every query
 * param forward unchanged — most importantly `?g=<token>`, the only way a
 * guest's name reaches their personalized invitation. A redirect that
 * dropped it would silently degrade every link already sent out under the
 * old slug instead of merely moving it.
 */
function buildRedirectPath(currentSlug: string, searchParams: SearchParamsRecord): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const queryString = query.toString();
  return queryString ? `/i/${currentSlug}?${queryString}` : `/i/${currentSlug}`;
}

/**
 * Server-rendered `<title>`/`<meta>` for link previews (Zalo, Messenger,
 * iMessage, ...) — the whole point of Task 17's OG image. Must never throw:
 * an unpublished/missing slug or a malformed `publishedDocument` falls back
 * to generic copy instead of taking down the page's `<head>` (the page body
 * itself still 404s/redirects normally below). `searchParams` is optional
 * only so existing tests that don't pass it keep working — Next itself
 * always supplies it for a real request.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<SearchParamsRecord>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const invitation = await loadInvitationBySlug(slug);
    if (!invitation) {
      const currentSlug = await findCurrentSlugForHistoricalSlug(slug);
      if (currentSlug) {
        permanentRedirect(buildRedirectPath(currentSlug, (await searchParams) ?? {}));
      }
      return {};
    }
    if (invitation.status !== "published" || !invitation.publishedDocument) {
      return {};
    }

    const parsed = InvitationDocumentSchema.safeParse(invitation.publishedDocument);
    if (!parsed.success) return {};

    const cover = findCoverSection(parsed.data.sections);
    const groomName = cover?.props.groomName || "Chú rể";
    const brideName = cover?.props.brideName || "Cô dâu";
    const title = `${groomName} & ${brideName} — Thiệp cưới`;
    const description = cover?.props.tagline || DEFAULT_TAGLINE;
    const url = `/i/${slug}`;

    return {
      title,
      description,
      // An invitation carries the couple's guest list by name (via `?g=`),
      // the addresses of their home and venue, phone numbers and, where a
      // gift section is used, bank account details. None of that was
      // handed over to be searchable, and a couple's traffic comes from
      // the link they send, never from Google.
      //
      // This does NOT affect link previews: Facebook's, Zalo's and
      // iMessage's scrapers read og: tags and ignore the robots directive,
      // which is why `openGraph` below stays exactly as it was and a test
      // pins the two together. `robots.ts` also deliberately leaves /i/
      // crawlable, because a crawler that is refused the page never reads
      // this line.
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        url,
        type: "website",
        locale: "vi_VN",
      },
    };
  } catch (error) {
    // `notFound()`/`permanentRedirect()` above communicate with the App
    // Router by THROWING — they'd otherwise be swallowed by this catch (it
    // exists to guard against a genuine DB/parsing failure, not against our
    // own deliberate control-flow signal). `unstable_rethrow` is Next's
    // documented way to tell the two apart: it rethrows redirect/notFound
    // errors and returns normally for anything else.
    unstable_rethrow(error);
    console.error(`generateMetadata failed for invitation slug=${slug}:`, error);
    return {};
  }
}

export default async function PublicInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const g = resolvedSearchParams.g;
  const guestToken = Array.isArray(g) ? g[0] : g;

  const invitation = await loadInvitationBySlug(slug);

  // This whole block runs BEFORE the try/catch below wrapping document
  // parsing — `permanentRedirect`/`notFound` throw control-flow errors that
  // must reach the App Router unmodified, so neither call may ever move
  // inside a try/catch that doesn't explicitly rethrow them.
  if (!invitation) {
    const currentSlug = await findCurrentSlugForHistoricalSlug(slug);
    if (currentSlug) {
      permanentRedirect(buildRedirectPath(currentSlug, resolvedSearchParams));
    }
    notFound();
  }

  if (invitation.status !== "published" || !invitation.publishedDocument) {
    notFound();
  }

  let document;
  try {
    document = InvitationDocumentSchema.parse(invitation.publishedDocument);
  } catch (error) {
    console.error(
      `Invalid publishedDocument for invitation ${invitation.id} (slug=${slug}):`,
      error,
    );
    notFound();
  }

  // Fire-and-forget: a view shouldn't wait on, or fail because of, this
  // write. `.catch(() => {})` swallows errors (e.g. a race with the
  // invitation being deleted) rather than crashing an otherwise-successful
  // render.
  prisma.invitation
    .update({ where: { slug }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  let guestName: string | null = null;
  if (guestToken) {
    const guest = await prisma.guest.findUnique({ where: { token: guestToken } });
    if (guest && guest.invitationId === invitation.id) {
      guestName = guest.name;
      if (!guest.viewedAt) {
        prisma.guest
          .update({ where: { token: guestToken }, data: { viewedAt: new Date() } })
          .catch(() => {});
      }
    }
  }

  return (
    <InvitePage
      document={document}
      guestName={guestName}
      settings={parseInvitationSettings(invitation.settings)}
      isPreview={false}
      slug={slug}
    />
  );
}
