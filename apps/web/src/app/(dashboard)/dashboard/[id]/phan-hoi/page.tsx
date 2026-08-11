import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { auth } from "@/auth";
import { formatVietnameseDate } from "@/lib/date";

type FormSectionDoc = Extract<Section, { type: "form" }>;

/** Same defensive parse as the public route: an invalid/legacy `publishedDocument` degrades to "no form sections" rather than crashing this page. */
function parsePublishedDocument(raw: unknown) {
  const result = InvitationDocumentSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Renders one submitted field value for the table — `undefined`/empty as "-", booleans and multi-select checkbox arrays spelled out in Vietnamese/joined for readability. */
function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  if (typeof value === "string") return value.trim() === "" ? "-" : value;
  return String(value);
}

/**
 * Owner's view of every submission ("responses") across all `form` sections
 * of one invitation — the RSVP form by default, but generic since `fields`
 * is schema-driven. `notFound()` (not a redirect) when the invitation
 * doesn't exist or belongs to someone else, matching the wishes moderation
 * page's convention.
 *
 * Deliberately unpaginated: a wedding invitation's guest list is small
 * enough (rarely more than a few hundred) that a single unpaginated query
 * is simpler and fine for Phase 0/1 — worth revisiting if that assumption
 * stops holding.
 */
export default async function ResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const submissions = await prisma.formSubmission.findMany({
    where: { invitationId: id },
    orderBy: { createdAt: "desc" },
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
  const attendingCount =
    rsvpSection && rsvpField
      ? (submissionsBySectionId.get(rsvpSection.id) ?? []).filter(
          (submission) => (submission.data as Record<string, unknown>)[rsvpField.id] === "Có",
        ).length
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Phản hồi</h1>
      <p className="mt-1 text-sm text-gray-600">
        Tổng số phản hồi: {submissions.length}
        {attendingCount !== null ? ` — Số khách xác nhận tham dự: ${attendingCount}` : ""}
      </p>
      <p className="mt-1 text-xs text-gray-400">Hiển thị toàn bộ phản hồi (chưa phân trang).</p>

      {formSections.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">Thiệp chưa có mục biểu mẫu nào.</p>
      ) : (
        formSections.map((section) => {
          const sectionSubmissions = submissionsBySectionId.get(section.id) ?? [];
          return (
            <section key={section.id} className="mt-8">
              <h2 className="text-base font-semibold text-gray-900">{section.props.title}</h2>

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
                                {formatCellValue(data[field.id])}
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
    </div>
  );
}
