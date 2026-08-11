import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { buildInvitationDocumentFromTemplate, toInvitationSummary } from "@/lib/invitations";

const UNAUTH_MESSAGE = "Bạn cần đăng nhập.";
const TEMPLATE_NOT_FOUND_MESSAGE = "Không tìm thấy mẫu thiệp.";
const MALFORMED_BODY_MESSAGE = "Yêu cầu không hợp lệ, vui lòng thử lại.";
const INVALID_TEMPLATE_DOCUMENT_MESSAGE =
  "Mẫu thiệp này hiện không hợp lệ, vui lòng thử mẫu khác hoặc liên hệ hỗ trợ.";

const postBodySchema = z.object({ templateId: z.string().min(1) }).strict();

/**
 * Creates a new draft invitation from a template. The slug is a
 * collision-proof placeholder (`nhap-<uuid>`) — the couple picks the real
 * public slug later at publish time (`POST /api/invitations/[id]/publish`),
 * which already validates uniqueness and format independently. It's built
 * to already satisfy that same format (`/^[a-z0-9-]{3,60}$/`) purely so an
 * invitation published without ever changing its slug still works, not
 * because this route expects that to happen.
 *
 * `template.document` is deep-copied (via `buildInvitationDocumentFromTemplate`,
 * which validates then `structuredClone`s) before being written to the new
 * `Invitation.document` row — the two must never share object references,
 * since the editor's autosave freely mutates an invitation's `document` in
 * place and that must never be able to reach back and corrupt the shared
 * `Template` row every other couple creates new invitations from. That
 * property is proven directly on `buildInvitationDocumentFromTemplate` in
 * `lib/__tests__/invitations.test.ts` (asserting object identity/isolation
 * in-process) rather than through this route's own DB-level test, which
 * can't actually distinguish a real clone from no clone at all — see that
 * test file's docstring for why.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTH_MESSAGE }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: MALFORMED_BODY_MESSAGE }, { status: 400 });
  }

  const parsedBody = postBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: MALFORMED_BODY_MESSAGE }, { status: 400 });
  }

  const template = await prisma.template.findUnique({ where: { id: parsedBody.data.templateId } });
  if (!template || !template.isActive) {
    return NextResponse.json({ error: TEMPLATE_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const document = buildInvitationDocumentFromTemplate(template.document);
  if (!document) {
    return NextResponse.json({ error: INVALID_TEMPLATE_DOCUMENT_MESSAGE }, { status: 500 });
  }

  const slug = `nhap-${randomUUID()}`;

  const invitation = await prisma.invitation.create({
    data: {
      userId: session.user.id,
      templateId: template.id,
      document,
      status: "draft",
      slug,
    },
  });

  return NextResponse.json({ id: invitation.id }, { status: 201 });
}

/** Lists the session user's invitations, newest-created first, shaped for the dashboard's card list (no `document`/`publishedDocument` — those are only needed by the editor/public page). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTH_MESSAGE }, { status: 401 });
  }

  const invitations = await prisma.invitation.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      viewCount: true,
      updatedAt: true,
      document: true,
    },
  });

  return NextResponse.json({
    invitations: invitations.map(toInvitationSummary),
  });
}
