import { notFound } from "next/navigation";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { prisma } from "@hpwd/db";
import { InvitePage, type InvitePageSettings } from "@/components/invite/InvitePage";

const DEFAULT_SETTINGS: InvitePageSettings = { showBadge: true };

/**
 * `Invitation.settings` is an untyped `Json` column (default
 * `{"showBadge": true}`) — this narrows it defensively rather than trusting
 * the DB shape, since a future settings field or a hand-edited row shouldn't
 * be able to crash the public page.
 */
function parseSettings(raw: unknown): InvitePageSettings {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "showBadge" in raw &&
    typeof (raw as { showBadge: unknown }).showBadge === "boolean"
  ) {
    return { showBadge: (raw as { showBadge: boolean }).showBadge };
  }
  return DEFAULT_SETTINGS;
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
      settings={parseSettings(invitation.settings)}
      isPreview={false}
      slug={slug}
    />
  );
}
