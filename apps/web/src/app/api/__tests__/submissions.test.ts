import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument, type InvitationDocument, type Section } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rate limiting is mocked per the same rationale as Task 10's wishes tests
// (see wishes.test.ts): `rate-limit.ts` already has its own real-Redis test
// suite, so re-exercising real Redis here would just add flakiness without
// covering anything new.
const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));

import { POST } from "../invites/[slug]/submissions/route";

// ---------------------------------------------------------------------------
// Fixtures — real Postgres (docker `hpwd-postgres`), no Prisma mocking. Every
// invitation/guest created by a test is tracked and deleted in `afterEach`.
// ---------------------------------------------------------------------------

let userId: string;
const createdInvitationIds: string[] = [];

function getFormSection(document: InvitationDocument) {
  const section = document.sections.find(
    (section): section is Extract<Section, { type: "form" }> => section.type === "form",
  );
  if (!section) {
    throw new Error("Fixture invalid: createDefaultDocument() has no form section");
  }
  return section;
}

async function createTestInvitation(
  opts: { published?: boolean; document?: InvitationDocument } = {},
): Promise<{ id: string; slug: string; document: InvitationDocument; formSectionId: string }> {
  const { published = true } = opts;
  const document = opts.document ?? createDefaultDocument();
  const formSectionId = getFormSection(document).id;
  const slug = `test-submissions-${randomUUID()}`;

  const invitation = await prisma.invitation.create({
    data: {
      slug,
      userId,
      document,
      publishedDocument: published ? document : undefined,
      status: published ? "published" : "draft",
      publishedAt: published ? new Date() : undefined,
    },
  });
  createdInvitationIds.push(invitation.id);
  return { id: invitation.id, slug, document, formSectionId };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function validRsvpData() {
  return { Tên: "Nguyễn Văn A" };
}

/** Builds a valid RSVP `data` payload keyed by field id, from the default document's form section. */
function validRsvpPayload(document: InvitationDocument) {
  const section = getFormSection(document);
  const data: Record<string, unknown> = {};
  for (const f of section.props.fields) {
    if (f.label === "Tên") data[f.id] = "Nguyễn Văn A";
    if (f.label === "Tham dự") data[f.id] = "Có";
  }
  return data;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `submissions-test-${randomUUID()}@test.local`, name: "Submissions Test User" },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(() => {
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(true);
});

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
});

describe("POST /api/invites/[slug]/submissions", () => {
  it("creates a submission for a valid RSVP payload and returns 201 {submission: {id, createdAt}}", async () => {
    const { slug, id: invitationId, document, formSectionId } = await createTestInvitation();
    const data = validRsvpPayload(document);

    const res = await POST(jsonRequest({ sectionId: formSectionId, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body.submission).sort()).toEqual(["createdAt", "id"]);

    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    expect(stored?.invitationId).toBe(invitationId);
    expect(stored?.sectionId).toBe(formSectionId);
    expect(stored?.data).toEqual(data);
    expect(stored?.guestToken).toBeNull();
  });

  it("returns 400 for a field not declared in the section", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const data = { ...validRsvpPayload(document), notADeclaredField: "x" };

    const res = await POST(jsonRequest({ sectionId: formSectionId, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 when a required field (Tên) is missing, with a 'là bắt buộc' message", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const section = getFormSection(document);
    const attendField = section.props.fields.find((f) => f.label === "Tham dự")!;

    const res = await POST(jsonRequest({ sectionId: formSectionId, data: { [attendField.id]: "Có" } }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Tên");
    expect(body.error).toContain("là bắt buộc");
  });

  it("returns 400 with a 'không hợp lệ' (not 'là bắt buộc') message for a present-but-out-of-range number", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const section = getFormSection(document);
    const guestsField = section.props.fields.find((f) => f.label === "Số người đi cùng")!;
    const data = { ...validRsvpPayload(document), [guestsField.id]: -5 };

    const res = await POST(jsonRequest({ sectionId: formSectionId, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Số người đi cùng");
    expect(body.error).toContain("không hợp lệ");
    expect(body.error).not.toContain("là bắt buộc");
  });

  it("returns 400 for a required text field whose value is only a control character (empties out after sanitizing)", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const section = getFormSection(document);
    const nameField = section.props.fields.find((f) => f.label === "Tên")!;
    const attendField = section.props.fields.find((f) => f.label === "Tham dự")!;
    // A lone control character (BEL, 0x07) is not whitespace, so it survives
    // Zod's `.trim()`/emptiness check, but `sanitizePlainText` strips it
    // down to an empty string — this is exactly the post-sanitize re-check
    // at route.ts's `findEmptyRequiredStringField`.
    const controlCharOnly = String.fromCharCode(7);

    const res = await POST(
      jsonRequest({
        sectionId: formSectionId,
        data: { [nameField.id]: controlCharOnly, [attendField.id]: "Có" },
      }),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Tên");
    expect(body.error).toContain("là bắt buộc");
  });

  it("returns 400 for a radio value outside the declared options", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const data = { ...validRsvpPayload(document) };
    const section = getFormSection(document);
    const attendField = section.props.fields.find((f) => f.label === "Tham dự")!;
    data[attendField.id] = "Có thể";

    const res = await POST(jsonRequest({ sectionId: formSectionId, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the invitation is not published", async () => {
    const { slug, document, formSectionId } = await createTestInvitation({ published: false });
    const data = validRsvpPayload(document);

    const res = await POST(jsonRequest({ sectionId: formSectionId, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a slug that doesn't exist", async () => {
    const res = await POST(jsonRequest({ sectionId: "anything", data: validRsvpData() }), {
      params: Promise.resolve({ slug: `no-such-slug-${randomUUID()}` }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a sectionId that doesn't exist in the published document", async () => {
    const { slug, document } = await createTestInvitation();
    const data = validRsvpPayload(document);

    const res = await POST(jsonRequest({ sectionId: `no-such-section-${randomUUID()}`, data }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a sectionId that exists but isn't a form section", async () => {
    const document = createDefaultDocument();
    const wishesSection = document.sections.find((s) => s.type === "wishes")!;
    const { slug } = await createTestInvitation({ document });

    const res = await POST(
      jsonRequest({ sectionId: wishesSection.id, data: { anything: "x" } }),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(404);
  });

  it("stores the matching Guest's token when guestToken matches a guest on this invitation", async () => {
    const { id: invitationId, slug, document, formSectionId } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId, name: "Khách mời" } });
    const data = validRsvpPayload(document);

    const res = await POST(jsonRequest({ sectionId: formSectionId, data, guestToken: guest.token }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    expect(stored?.guestToken).toBe(guest.token);
  });

  it("stores guestToken as null (never 400s) for a real Guest token belonging to a DIFFERENT invitation", async () => {
    // IDOR check: a guest token is only ever a courtesy link, scoped to the
    // invitation it was issued for — a real, valid token from someone
    // else's invitation must not get attached to this one's submission.
    const { slug, formSectionId, document } = await createTestInvitation();
    const otherInvitation = await createTestInvitation();
    const foreignGuest = await prisma.guest.create({
      data: { invitationId: otherInvitation.id, name: "Khách của thiệp khác" },
    });
    const data = validRsvpPayload(document);

    const res = await POST(
      jsonRequest({ sectionId: formSectionId, data, guestToken: foreignGuest.token }),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    expect(stored?.guestToken).toBeNull();
  });

  it("stores guestToken as null (never 400s) for a foreign or garbage guestToken", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const data = validRsvpPayload(document);

    const res = await POST(
      jsonRequest({ sectionId: formSectionId, data, guestToken: "totally-garbage-token" }),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    expect(stored?.guestToken).toBeNull();
  });

  it("stores guestToken as null (never 400s) for an empty-string guestToken", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const data = validRsvpPayload(document);

    const res = await POST(jsonRequest({ sectionId: formSectionId, data, guestToken: "" }), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    expect(stored?.guestToken).toBeNull();
  });

  it("returns 429 once the rate limiter throttles the request", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const data = validRsvpPayload(document);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(false);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await POST(
        jsonRequest({ sectionId: formSectionId, data }, { "x-forwarded-for": "203.0.113.20" }),
        { params: Promise.resolve({ slug }) },
      );
      statuses.push(res.status);
    }

    expect(statuses).toEqual([201, 201, 201, 429]);
    expect(rateLimitMock).toHaveBeenCalledWith(`form:203.0.113.20:${slug}:${formSectionId}`, {
      limit: 3,
      windowSec: 60,
    });
  });

  it("strips control characters from string field values before storing", async () => {
    const { slug, document, formSectionId } = await createTestInvitation();
    const section = getFormSection(document);
    const nameField = section.props.fields.find((f) => f.label === "Tên")!;
    const messageField = section.props.fields.find((f) => f.label === "Lời nhắn")!;
    const attendField = section.props.fields.find((f) => f.label === "Tham dự")!;

    // A literal control character (NUL, 0x00) sits between "hello" and
    // "world" here — exactly what sanitizePlainText strips before storing.
    const dirtyMessage = "hello" + String.fromCharCode(0) + "world";

    const res = await POST(
      jsonRequest({
        sectionId: formSectionId,
        data: { [nameField.id]: "AB", [messageField.id]: dirtyMessage, [attendField.id]: "Có" },
      }),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.formSubmission.findUnique({ where: { id: body.submission.id } });
    const storedData = stored?.data as Record<string, string>;
    expect(storedData[nameField.id]).toBe("AB");
    expect(storedData[messageField.id]).toBe("helloworld");
  });
});
