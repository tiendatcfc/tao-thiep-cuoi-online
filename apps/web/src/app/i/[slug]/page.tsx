import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { prisma } from "@hpwd/db";
import { InvitePage } from "@/components/invite/InvitePage";
import { parseInvitationSettings } from "@/lib/settings";

const DEFAULT_TAGLINE = "Trân trọng kính mời bạn đến dự lễ cưới của chúng tôi.";

function findCoverSection(sections: Section[]): Extract<Section, { type: "cover" }> | null {
  return sections.find((section): section is Extract<Section, { type: "cover" }> => section.type === "cover") ?? null;
}

/**
 * Server-rendered `<title>`/`<meta>` for link previews (Zalo, Messenger,
 * iMessage, ...) — the whole point of Task 17's OG image. Must never throw:
 * an unpublished/missing slug or a malformed `publishedDocument` falls back
 * to generic copy instead of taking down the page's `<head>` (the page body
 * itself still 404s normally below).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const invitation = await prisma.invitation.findUnique({ where: { slug } });
    if (!invitation || invitation.status !== "published" || !invitation.publishedDocument) {
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
      openGraph: {
        title,
        description,
        url,
        type: "website",
        locale: "vi_VN",
      },
    };
  } catch (error) {
    console.error(`generateMetadata failed for invitation slug=${slug}:`, error);
    return {};
  }
}

export default async function PublicInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
}) {
  const { slug } = await params;
  const { g } = await searchParams;
  const guestToken = Array.isArray(g) ? g[0] : g;

  const invitation = await prisma.invitation.findUnique({ where: { slug } });

  if (!invitation || invitation.status !== "published" || !invitation.publishedDocument) {
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
