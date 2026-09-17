import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { auth } from "@/auth";
import { toCsv, uniqueHeaders } from "@/lib/csv";
import { formatVietnameseDate } from "@/lib/date";
import { findOwnedInvitation, NOT_FOUND_MESSAGE, UNAUTHENTICATED_MESSAGE } from "@/lib/ownership";
import { formatSubmissionValue } from "@/lib/submissions";

type FormSectionDoc = Extract<Section, { type: "form" }>;

const MISSING_SECTION_MESSAGE = "Thiếu tham số sectionId.";

/** Fixed leading columns, matching the responses table's first two headers. */
const TIME_HEADER = "Thời gian";
const GUEST_HEADER = "Tên khách";
const ANONYMOUS_GUEST = "Ẩn danh";

/**
 * Turns the section title into a filename that survives an HTTP header.
 *
 * `Content-Disposition`'s plain `filename=` parameter is latin-1 only, so the
 * Vietnamese title is stripped down to ASCII for it and the real UTF-8 name
 * is sent alongside in `filename*` (RFC 5987), which every current browser
 * prefers when both are present.
 */
function contentDisposition(title: string): string {
  const base = (title.trim() || "phan-hoi").slice(0, 60);
  const ascii = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = ascii.length > 0 ? ascii : "phan-hoi";
  return `attachment; filename="${fallback}.csv"; filename*=UTF-8''${encodeURIComponent(`${base}.csv`)}`;
}

/**
 * Owner-only CSV export of one form section's submissions.
 *
 * Columns come from the section's field labels in the *published* document —
 * the same document guests actually submitted against, so a label the couple
 * has edited since (but not republished) doesn't relabel answers that were
 * given under the old wording.
 *
 * 404 (never 403) for both "no such invitation" and "not yours", via
 * `findOwnedInvitation`; a `sectionId` that isn't a form section of THIS
 * invitation is also a 404, so the endpoint can't be used to confirm that
 * some other invitation's section id exists.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  const { id } = await params;
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const sectionId = new URL(request.url).searchParams.get("sectionId");
  if (!sectionId) {
    return NextResponse.json({ error: MISSING_SECTION_MESSAGE }, { status: 400 });
  }

  // Same defensive parse as the responses page: a legacy or hand-edited
  // `publishedDocument` degrades to "no such section" rather than a 500.
  const parsed = InvitationDocumentSchema.safeParse(invitation.publishedDocument);
  const section = parsed.success
    ? parsed.data.sections.find((s): s is FormSectionDoc => s.type === "form" && s.id === sectionId)
    : undefined;
  if (!section) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { invitationId: id, sectionId },
    orderBy: { createdAt: "desc" },
  });

  const tokens = Array.from(
    new Set(submissions.map((s) => s.guestToken).filter((token): token is string => Boolean(token))),
  );
  const guests =
    tokens.length > 0
      ? await prisma.guest.findMany({
          where: { invitationId: id, token: { in: tokens } },
          select: { token: true, name: true },
        })
      : [];
  const guestNameByToken = new Map(guests.map((guest) => [guest.token, guest.name]));

  // Question labels are free text and may repeat; `uniqueHeaders` keeps each
  // one addressable so a duplicate label can't silently drop a column. The
  // two fixed headers go through it too, in case a couple names a question
  // "Tên khách".
  const headers = uniqueHeaders([TIME_HEADER, GUEST_HEADER, ...section.props.fields.map((f) => f.label)]);
  const [timeHeader, guestHeader, ...fieldHeaders] = headers;

  const rows = submissions.map((submission) => {
    const data = submission.data as Record<string, unknown>;
    const row: Record<string, string> = {
      [timeHeader]: formatVietnameseDate(submission.createdAt.toISOString(), {
        hour: "2-digit",
        minute: "2-digit",
      }),
      [guestHeader]: submission.guestToken
        ? (guestNameByToken.get(submission.guestToken) ?? ANONYMOUS_GUEST)
        : ANONYMOUS_GUEST,
    };
    section.props.fields.forEach((field, index) => {
      row[fieldHeaders[index]] = formatSubmissionValue(data[field.id], "");
    });
    return row;
  });

  return new Response(toCsv(rows, headers), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(section.props.title),
      // Response data is per-owner; never let a shared cache hold it.
      "cache-control": "no-store",
    },
  });
}
