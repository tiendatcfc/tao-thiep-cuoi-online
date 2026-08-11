import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as every other route test in this directory: `auth()` is
// mocked because there's no real browser session when calling route
// handlers directly; everything else (Postgres) is real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET, POST } from "../invitations/route";

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];
const createdTemplateIds: string[] = [];

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestTemplate(overrides: { isActive?: boolean; document?: unknown } = {}): Promise<string> {
  const template = await prisma.template.create({
    data: {
      name: `Test template ${randomUUID()}`,
      tier: "basic",
      category: "test",
      thumbnailUrl: "/placeholder-template.png",
      document: (overrides.document ?? createDefaultDocument()) as never,
      isActive: overrides.isActive ?? true,
    },
  });
  createdTemplateIds.push(template.id);
  return template.id;
}

async function createTestInvitation(owner: string, overrides: { document?: unknown } = {}): Promise<string> {
  const invitation = await prisma.invitation.create({
    data: {
      slug: `test-invitations-list-${randomUUID()}`,
      userId: owner,
      document: (overrides.document ?? createDefaultDocument()) as never,
      status: "draft",
    },
  });
  createdInvitationIds.push(invitation.id);
  return invitation.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `invitations-test-${randomUUID()}@test.local`, name: "Invitations Test User" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `invitations-test-other-${randomUUID()}@test.local`, name: "Other User" },
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
  if (createdTemplateIds.length > 0) {
    await prisma.template.deleteMany({ where: { id: { in: createdTemplateIds } } });
    createdTemplateIds.length = 0;
  }
});

describe("POST /api/invitations", () => {
  it("returns 401 when unauthenticated", async () => {
    const templateId = await createTestTemplate();

    const res = await POST(jsonRequest({ templateId }));

    expect(res.status).toBe(401);
  });

  it("returns 404 when the template does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ templateId: `no-such-template-${randomUUID()}` }));

    expect(res.status).toBe(404);
  });

  it("returns 404 when the template is inactive", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const templateId = await createTestTemplate({ isActive: false });

    const res = await POST(jsonRequest({ templateId }));

    expect(res.status).toBe(404);
  });

  it("returns 400 when the body is malformed", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(400);
  });

  it("returns 201 {id}, creating a draft invitation with a unique valid slug and the template's document deep-copied", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const templateId = await createTestTemplate();

    const res = await POST(jsonRequest({ templateId }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    createdInvitationIds.push(body.id);

    const invitation = await prisma.invitation.findUnique({ where: { id: body.id } });
    expect(invitation).not.toBeNull();
    expect(invitation?.userId).toBe(userId);
    expect(invitation?.templateId).toBe(templateId);
    expect(invitation?.status).toBe("draft");
    // Slug must satisfy the same regex the publish route enforces
    // (`/^[a-z0-9-]{3,60}$/`), since a placeholder slug could in principle
    // be published as-is before the couple ever changes it.
    expect(invitation?.slug).toMatch(/^[a-z0-9-]{3,60}$/);

    // Deep copy: mutating the created invitation's document must not affect
    // the Template row it was created from.
    const doc = invitation!.document as { theme: { primary: string } };
    doc.theme.primary = "#MUTATED";
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    expect((template!.document as { theme: { primary: string } }).theme.primary).not.toBe("#MUTATED");
  });

  it("creates invitations with distinct slugs across repeated calls", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const templateId = await createTestTemplate();

    const res1 = await POST(jsonRequest({ templateId }));
    const res2 = await POST(jsonRequest({ templateId }));
    const body1 = await res1.json();
    const body2 = await res2.json();
    createdInvitationIds.push(body1.id, body2.id);

    const [inv1, inv2] = await Promise.all([
      prisma.invitation.findUnique({ where: { id: body1.id } }),
      prisma.invitation.findUnique({ where: { id: body2.id } }),
    ]);
    expect(inv1?.slug).not.toBe(inv2?.slug);
  });

  it("returns 500 with a Vietnamese message when the seeded template's document fails schema validation", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const templateId = await createTestTemplate({ document: { not: "a valid document" } });

    const res = await POST(jsonRequest({ templateId }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
  });
});

describe("GET /api/invitations", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns only the session user's invitations, newest first", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });

    const idA = await createTestInvitation(userId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const idB = await createTestInvitation(userId);
    await createTestInvitation(otherUserId);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.invitations.map((i: { id: string }) => i.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    expect(ids.indexOf(idB)).toBeLessThan(ids.indexOf(idA));
    for (const inv of body.invitations) {
      expect(Object.keys(inv).sort()).toEqual(
        ["coverNames", "id", "publishedAt", "slug", "status", "updatedAt", "viewCount"].sort(),
      );
    }
  });

  it("derives coverNames from the cover section's groom & bride names", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const document = createDefaultDocument();
    const cover = document.sections.find(
      (s): s is Extract<Section, { type: "cover" }> => s.type === "cover",
    );
    if (!cover) throw new Error("fixture invalid: no cover section");
    cover.props.groomName = "Minh";
    cover.props.brideName = "Lan";
    const id = await createTestInvitation(userId, { document });

    const res = await GET();
    const body = await res.json();
    const found = body.invitations.find((i: { id: string }) => i.id === id);
    expect(found.coverNames).toBe("Minh & Lan");
  });

  it("falls back to 'Thiệp chưa đặt tên' when the cover has no names", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const document = createDefaultDocument();
    const cover = document.sections.find(
      (s): s is Extract<Section, { type: "cover" }> => s.type === "cover",
    );
    if (!cover) throw new Error("fixture invalid: no cover section");
    cover.props.groomName = "";
    cover.props.brideName = "";
    const id = await createTestInvitation(userId, { document });

    const res = await GET();
    const body = await res.json();
    const found = body.invitations.find((i: { id: string }) => i.id === id);
    expect(found.coverNames).toBe("Thiệp chưa đặt tên");
  });
});

// Sanity check that the fixture builder itself produces schema-valid
// documents (guards against a typo in this test file masking a real bug).
describe("fixtures", () => {
  it("createDefaultDocument() passes InvitationDocumentSchema", () => {
    expect(() => InvitationDocumentSchema.parse(createDefaultDocument())).not.toThrow();
  });
});
