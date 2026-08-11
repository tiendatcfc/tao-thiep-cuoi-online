import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema } from "@hpwd/schema";
import { auth } from "@/auth";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { parseInvitationSettings } from "@/lib/settings";

/**
 * Editor entry point. The middleware in `auth.config.ts` already redirects
 * signed-out visitors to `/dang-nhap` for the whole `/editor/*` matcher, so
 * the `auth()` check below is defense-in-depth, matching the same pattern
 * `dashboard/[id]/loi-chuc/page.tsx` uses. `notFound()` (not a redirect)
 * whenever the invitation doesn't exist or belongs to someone else — the
 * two cases are deliberately indistinguishable, same as the API route.
 */
export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== session.user.id) {
    notFound();
  }

  const parsed = InvitationDocumentSchema.safeParse(invitation.document);
  if (!parsed.success) {
    // The autosave endpoint only ever writes schema-valid documents, so a
    // parse failure here means the row is corrupt some other way. Silently
    // falling back to a blank/default document would risk the very next
    // autosave permanently overwriting the couple's real content with it —
    // better to fail loudly than lose data quietly.
    throw new Error(`Invitation ${id} has a document that fails schema validation`);
  }

  return (
    <EditorLayout
      invitationId={invitation.id}
      slug={invitation.slug}
      initialDocument={parsed.data}
      initialShowBadge={parseInvitationSettings(invitation.settings).showBadge}
    />
  );
}
