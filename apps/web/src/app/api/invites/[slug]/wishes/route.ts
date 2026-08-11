import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";

const WISH_PAGE_SIZE = 20;
const WISH_RATE_LIMIT = { limit: 5, windowSec: 60 };
const NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";

const wishInputSchema = z.object({
  guestName: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên của bạn.")
    .max(80, "Tên tối đa 80 ký tự."),
  message: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập lời chúc.")
    .max(500, "Lời chúc tối đa 500 ký tự."),
});

/**
 * Reads `wishes.requireApproval` off the invitation's *published* document.
 * Defaults to `false` (don't require approval) whenever the document fails
 * schema validation or simply has no wishes section — a couple who never
 * added a wishes section, or a legacy/malformed `publishedDocument`,
 * shouldn't silently start moderating wishes nobody asked to moderate.
 */
function getRequireApproval(publishedDocument: unknown): boolean {
  const parsed = InvitationDocumentSchema.safeParse(publishedDocument);
  if (!parsed.success) return false;
  const wishesSection = parsed.data.sections.find(
    (section): section is Extract<Section, { type: "wishes" }> => section.type === "wishes",
  );
  return wishesSection?.props.requireApproval ?? false;
}

async function findPublishedInvitation(slug: string) {
  const invitation = await prisma.invitation.findUnique({ where: { slug } });
  if (!invitation || invitation.status !== "published" || !invitation.publishedDocument) {
    return null;
  }
  return invitation;
}

/** Public: submit a guest wish. Rate-limited per IP+slug; moderated (created hidden) when the section's `requireApproval` is on. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const invitation = await findPublishedInvitation(slug);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const ip = getClientIp(request);
  const allowed = await rateLimit(`wish:${ip}:${slug}`, WISH_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const parsed = wishInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 },
    );
  }

  // Defense in depth: `.trim()` above only strips JS whitespace, not
  // arbitrary control characters, so a name/message made up entirely of
  // those could pass the min-length check above yet sanitize down to an
  // empty string. Re-checked here rather than trusting sanitize to always
  // leave *something* behind.
  const guestName = sanitizePlainText(parsed.data.guestName);
  const message = sanitizePlainText(parsed.data.message);
  if (!guestName || !message) {
    return NextResponse.json({ error: "Vui lòng nhập tên và lời chúc." }, { status: 400 });
  }

  const requireApproval = getRequireApproval(invitation.publishedDocument);

  const wish = await prisma.wish.create({
    data: {
      invitationId: invitation.id,
      guestName,
      message,
      isHidden: requireApproval,
    },
  });

  return NextResponse.json(
    {
      wish: {
        id: wish.id,
        guestName: wish.guestName,
        message: wish.message,
        createdAt: wish.createdAt,
      },
    },
    { status: 201 },
  );
}

/** Public: paginated list of visible (non-hidden) wishes, newest first, 20 per page. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const invitation = await findPublishedInvitation(slug);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const cursor = new URL(request.url).searchParams.get("cursor");

  const rows = await prisma.wish.findMany({
    where: { invitationId: invitation.id, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: WISH_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > WISH_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, WISH_PAGE_SIZE) : rows;

  return NextResponse.json({
    wishes: page.map((wish) => ({
      id: wish.id,
      guestName: wish.guestName,
      message: wish.message,
      createdAt: wish.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
