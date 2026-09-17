import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument, type InvitationDocument, type Section } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as `guests.test.ts`: only `auth()` is mocked (there is no
// real browser session when calling a route handler directly); Postgres is
// real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "../invitations/[id]/submissions/export/route";

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];

type FormSectionDoc = Extract<Section, { type: "form" }>;

function formSectionOf(document: InvitationDocument): FormSectionDoc {
  const section = document.sections.find((s): s is FormSectionDoc => s.type === "form");
  if (!section) throw new Error("default document is expected to contain a form section");
  return section;
}

async function createPublishedInvitation(ownerId: string = userId) {
  const document = createDefaultDocument();
  const invitation = await prisma.invitation.create({
    data: {
      slug: `test-export-${randomUUID()}`,
      userId: ownerId,
      document,
      publishedDocument: document,
      status: "published",
    },
  });
  createdInvitationIds.push(invitation.id);
  return { id: invitation.id, section: formSectionOf(document) };
}

function exportRequest(id: string, sectionId?: string): [Request, { params: Promise<{ id: string }> }] {
  const url = new URL(`http://localhost/api/invitations/${id}/submissions/export`);
  if (sectionId !== undefined) url.searchParams.set("sectionId", sectionId);
  return [new Request(url), { params: Promise.resolve({ id }) }];
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `export-test-${randomUUID()}@test.local`, name: "Export Test User" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `export-test-other-${randomUUID()}@test.local`, name: "Other User" },
  });
  otherUserId = other.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
});

describe("GET /api/invitations/[id]/submissions/export", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id, section } = await createPublishedInvitation();

    const res = await GET(...exportRequest(id, section.id));

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await GET(...exportRequest(`no-such-id-${randomUUID()}`, "any"));

    const { id, section } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await GET(...exportRequest(id, section.id));

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    // Identical bodies, not just identical statuses: a different message
    // would tell a stranger the invitation exists.
    expect(await missingRes.json()).toEqual(await notOwnedRes.json());
  });

  it("returns 404 for a sectionId that belongs to a different invitation", async () => {
    const owned = await createPublishedInvitation();
    const otherInvitation = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(...exportRequest(owned.id, otherInvitation.section.id));

    expect(res.status).toBe(404);
  });

  it("returns 400 when sectionId is missing", async () => {
    const { id } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(...exportRequest(id));

    expect(res.status).toBe(400);
  });

  it("serves a UTF-8 CSV attachment whose BYTES start with the BOM", async () => {
    const { id, section } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(...exportRequest(id, section.id));
    const bytes = new Uint8Array(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    // Asserted on raw bytes, NOT on `await res.text()`: the WHATWG UTF-8
    // decoder strips a leading BOM, so a text-level check passes even when
    // the bytes Excel actually receives have none.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("keeps the Vietnamese filename readable via RFC 5987 filename*", async () => {
    const { id, section } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const disposition = (await GET(...exportRequest(id, section.id))).headers.get("content-disposition") ?? "";

    // The plain `filename=` must stay latin-1 safe or the header is invalid.
    expect(disposition).toMatch(/filename="[\x20-\x7e]+\.csv"/);
    expect(disposition).toContain("filename*=UTF-8''");
  });

  it("writes one column per field label, after Thời gian and Tên khách", async () => {
    const { id, section } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(...exportRequest(id, section.id));
    const header = (await res.text()).replace(/^\ufeff/, "").split("\r\n")[0];

    expect(header.split(",").slice(0, 2)).toEqual(["Thời gian", "Tên khách"]);
    for (const field of section.props.fields) {
      expect(header).toContain(field.label);
    }
  });

  it("resolves guestToken to the guest's name and falls back to Ẩn danh", async () => {
    const { id, section } = await createPublishedInvitation();
    const guest = await prisma.guest.create({
      data: { invitationId: id, name: "Nguyễn Văn An", token: `tok-${randomUUID()}` },
    });
    const nameField = section.props.fields[0];
    await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: section.id, data: { [nameField.id]: "A" }, guestToken: guest.token },
    });
    await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: section.id, data: { [nameField.id]: "B" }, guestToken: null },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const text = await (await GET(...exportRequest(id, section.id))).text();

    expect(text).toContain("Nguyễn Văn An");
    expect(text).toContain("Ẩn danh");
  });

  it("only exports submissions of the requested section", async () => {
    const { id, section } = await createPublishedInvitation();
    const nameField = section.props.fields[0];
    await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: section.id, data: { [nameField.id]: "thuộc section này" } },
    });
    await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: "some-other-section", data: { [nameField.id]: "KHÔNG được xuất" } },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const text = await (await GET(...exportRequest(id, section.id))).text();

    expect(text).toContain("thuộc section này");
    expect(text).not.toContain("KHÔNG được xuất");
  });

  it("neutralises a formula a guest typed into an answer", async () => {
    const { id, section } = await createPublishedInvitation();
    const nameField = section.props.fields[0];
    await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: section.id, data: { [nameField.id]: "=HYPERLINK(\"http://evil\",\"x\")" } },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const text = await (await GET(...exportRequest(id, section.id))).text();

    expect(text).toContain("'=HYPERLINK");
    // The raw formula must never appear unprefixed at the start of a cell.
    expect(text).not.toMatch(/(^|,|")=HYPERLINK/);
  });

  it("spells out checkbox arrays and booleans the same way the page does", async () => {
    const { id, section } = await createPublishedInvitation();
    const nameField = section.props.fields[0];
    await prisma.formSubmission.create({
      data: {
        invitationId: id,
        sectionId: section.id,
        data: { [nameField.id]: ["Gà", "Bò"] },
      },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const text = await (await GET(...exportRequest(id, section.id))).text();

    expect(text).toContain('"Gà, Bò"');
  });

  it("returns just the header row when there are no submissions yet", async () => {
    const { id, section } = await createPublishedInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const text = (await (await GET(...exportRequest(id, section.id))).text()).replace(/^\ufeff/, "");

    expect(text.split("\r\n").filter((line) => line !== "")).toHaveLength(1);
  });
});
