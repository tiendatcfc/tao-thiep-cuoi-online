import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { PAGE_SIZE, pageRange, resolvePage, totalPagesFor } from "@/lib/pagination";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { auth } from "@/auth";
import { formatVietnameseDate } from "@/lib/date";
import { formatSubmissionValue } from "@/lib/submissions";



type FormSectionDoc = Extract<Section, { type: "form" }>;

/** Same defensive parse as the public route: an invalid/legacy `publishedDocument` degrades to "no form sections" rather than crashing this page. */
function parsePublishedDocument(raw: unknown) {
  const result = InvitationDocumentSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Owner's view of every submission ("responses") across all `form` sections
 * of one invitation — the RSVP form by default, but generic since `fields`
 * is schema-driven. `notFound()` (not a redirect) when the invitation
 * doesn't exist or belongs to someone else, matching the wishes moderation
 * page's convention.
 *
 * Paginated at `PAGE_SIZE` newest-first across ALL form sections at once
 * (one shared `?trang=`), rather than per section: almost every invitation
 * has exactly one form, and a separate page cursor per section would put two
 * independent paginators on screen for the rare case that it doesn't. Anyone
 * who wants the complete set uses the CSV export, which is never paginated.
 */
export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== session.user.id) {
    notFound();
  }

  const document = parsePublishedDocument(invitation.publishedDocument);
  const formSections: FormSectionDoc[] = document
    ? document.sections.filter((section): section is FormSectionDoc => section.type === "form")
    : [];

  const totalSubmissions = await prisma.formSubmission.count({ where: { invitationId: id } });
  const totalPages = totalPagesFor(totalSubmissions);
  const page = resolvePage(query.trang, totalPages);

  const submissions = await prisma.formSubmission.findMany({
    where: { invitationId: id },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const guestTokens = Array.from(
    new Set(submissions.map((submission) => submission.guestToken).filter((token): token is string => Boolean(token))),
  );
  const guests =
    guestTokens.length > 0
      ? await prisma.guest.findMany({ where: { invitationId: id, token: { in: guestTokens } } })
      : [];
  const guestNameByToken = new Map(guests.map((guest) => [guest.token, guest.name]));

  const submissionsBySectionId = new Map<string, typeof submissions>();
  for (const submission of submissions) {
    const list = submissionsBySectionId.get(submission.sectionId) ?? [];
    list.push(submission);
    submissionsBySectionId.set(submission.sectionId, list);
  }

  // Attendance summary: the RSVP-flagged form section's radio field whose
  // options include "Có" — the seeded default document's shape, but found
  // generically rather than hardcoding a field id, since a custom RSVP form
  // (Phase 2's form builder) may declare its own field ids.
  const rsvpSection = formSections.find((section) => section.props.isRsvp);
  const rsvpField = rsvpSection?.props.fields.find(
    (field) => field.type === "radio" && field.options.includes("Có"),
  );
  // Counted with its own query over EVERY submission, not over `submissions`
  // — that array is one page's worth now, and filtering it would quietly turn
  // the headline attendance number into "attendees on page 1".
  const attendingCount =
    rsvpSection && rsvpField
      ? await prisma.formSubmission.count({
          where: {
            invitationId: id,
            sectionId: rsvpSection.id,
            data: { path: [rsvpField.id], equals: "Có" },
          },
        })
      : null;

  const { first: firstOnPage, last: lastOnPage } = pageRange(page, submissions.length, totalSubmissions);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Phản hồi</h1>
      <p className="mt-1 text-sm text-gray-600">
        Tổng số phản hồi: {totalSubmissions}
        {attendingCount !== null ? ` — Số khách xác nhận tham dự: ${attendingCount}` : ""}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {totalSubmissions === 0
          ? "Chưa có phản hồi nào."
          : `Đang hiện ${firstOnPage}–${lastOnPage} trong ${totalSubmissions} phản hồi (trang ${page}/${totalPages}). Tải CSV để lấy toàn bộ.`}
      </p>

      {formSections.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">Thiệp chưa có mục biểu mẫu nào.</p>
      ) : (
        formSections.map((section) => {
          const sectionSubmissions = submissionsBySectionId.get(section.id) ?? [];
          return (
            <section key={section.id} className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">{section.props.title}</h2>
                {/* Plain link, not a fetch + blob: the route already sends
                    Content-Disposition, so the browser downloads it with no
                    client JS and the page stays a server component. It always
                    exports ALL submissions of this section, never just the
                    page on screen. */}
                <a
                  href={`/api/invitations/${id}/submissions/export?sectionId=${encodeURIComponent(section.id)}`}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Tải CSV
                </a>
              </div>

              {sectionSubmissions.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400">Chưa có phản hồi nào.</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                          Thời gian
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                          Tên khách
                        </th>
                        {section.props.fields.map((field) => (
                          <th
                            key={field.id}
                            className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500"
                          >
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sectionSubmissions.map((submission) => {
                        const data = submission.data as Record<string, unknown>;
                        const guestName = submission.guestToken
                          ? (guestNameByToken.get(submission.guestToken) ?? "Ẩn danh")
                          : "Ẩn danh";
                        return (
                          <tr key={submission.id}>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                              {formatVietnameseDate(submission.createdAt.toISOString(), {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-700">{guestName}</td>
                            {section.props.fields.map((field) => (
                              <td key={field.id} className="px-3 py-2 text-gray-700">
                                {formatSubmissionValue(data[field.id], "-")}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}

      {totalPages > 1 ? (
        <nav aria-label="Phân trang phản hồi" className="mt-8 flex items-center justify-center gap-2">
          {/* Real links, so the browser back button and "open in new tab"
              both behave; `scroll={false}` is not needed because each page is
              a fresh server render. */}
          {page > 1 ? (
            <Link
              href={`/dashboard/${id}/phan-hoi?trang=${page - 1}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              ← Trang trước
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              ← Trang trước
            </span>
          )}
          <span className="text-sm text-gray-600">
            Trang {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/dashboard/${id}/phan-hoi?trang=${page + 1}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Trang sau →
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              Trang sau →
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
