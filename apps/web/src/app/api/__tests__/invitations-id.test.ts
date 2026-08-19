import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as `wishes.test.ts`: `auth()` is mocked because there's no
// real browser session when calling route handlers directly; everything
// else (Postgres) is real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { DELETE, GET, PATCH } from "../invitations/[id]/route";

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];

async function createTestInvitation(): Promise<{ id: string; slug: string }> {
  const slug = `test-editor-${randomUUID()}`;
  const document = createDefaultDocument();
  const invitation = await prisma.invitation.create({
    data: { slug, userId, document, status: "draft" },
  });
  createdInvitationIds.push(invitation.id);
  return { id: invitation.id, slug };
}

function jsonRequest(body: unknown, method: string): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `editor-test-${randomUUID()}@test.local`, name: "Editor Test User" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `editor-test-other-${randomUUID()}@test.local`, name: "Other User" },
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

describe("GET /api/invitations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();

    const res = await GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    // Identical bodies, not just identical status codes — a response that
    // distinguished "doesn't exist" from "not yours" would let a guessed id
    // be used to probe which invitations exist.
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);
  });

  it("returns {invitation: {id, slug, status, document, settings, version}} for the owner", async () => {
    const { id, slug } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.invitation).sort()).toEqual([
      "document",
      "id",
      "settings",
      "slug",
      "status",
      "version",
    ]);
    expect(body.invitation.id).toBe(id);
    expect(body.invitation.slug).toBe(slug);
    expect(body.invitation.status).toBe("draft");
    expect(body.invitation.document.version).toBe(1);
    expect(body.invitation.settings).toEqual({ showBadge: true });
  });

  // Load-bearing for the whole feature: a fresh row's row-level `version`
  // (distinct from `document.version`, the document *format* version above)
  // starts at 0 and is what the client must echo back on its first PATCH.
  it("returns the row's current version (starts at 0 for a freshly created invitation)", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitation.version).toBe(0);
  });
});

describe("PATCH /api/invitations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();

    const res = await PATCH(jsonRequest({ document: createDefaultDocument() }, "PATCH"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await PATCH(jsonRequest({ document: createDefaultDocument() }, "PATCH"), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await PATCH(jsonRequest({ document: createDefaultDocument() }, "PATCH"), {
      params: Promise.resolve({ id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);
  });

  it("returns 400 with a Vietnamese message when the document fails schema validation", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(
      jsonRequest({ document: { version: 1, sections: "not-an-array" }, version: 0 }, "PATCH"),
      { params: Promise.resolve({ id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // Vietnamese diacritics somewhere in the message.
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
  });

  it("returns 200 {savedAt, version}, persists the document, and leaves publishedDocument untouched", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const before = await prisma.invitation.findUnique({ where: { id } });
    expect(before?.publishedDocument).toBeNull();
    expect(before?.version).toBe(0);

    const updatedDoc = createDefaultDocument();
    updatedDoc.theme.primary = "#ABCDEF";

    const before2 = Date.now();
    const res = await PATCH(jsonRequest({ document: updatedDoc, version: 0 }, "PATCH"), {
      params: Promise.resolve({ id }),
    });
    const after2 = Date.now();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.savedAt).toBe("number");
    expect(body.savedAt).toBeGreaterThanOrEqual(before2);
    expect(body.savedAt).toBeLessThanOrEqual(after2);
    expect(body.version).toBe(1);

    const stored = await prisma.invitation.findUnique({ where: { id } });
    expect((stored?.document as { theme: { primary: string } }).theme.primary).toBe("#ABCDEF");
    expect(stored?.publishedDocument).toBeNull();
    expect(stored?.version).toBe(1);
  });

  it("returns 400 when the request body isn't valid JSON", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(
      new Request("http://localhost/api/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id }) },
    );

    expect(res.status).toBe(400);
  });

  it("accepts {settings} alone, persisting it without touching document, and still bumps version", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const before = await prisma.invitation.findUnique({ where: { id } });

    const res = await PATCH(jsonRequest({ settings: { showBadge: false }, version: 0 }, "PATCH"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.savedAt).toBe("number");
    expect(body.version).toBe(1);

    const stored = await prisma.invitation.findUnique({ where: { id } });
    expect(stored?.settings).toEqual({ showBadge: false });
    expect(stored?.document).toEqual(before?.document);
    expect(stored?.version).toBe(1);
  });

  it("returns 400 when settings.showBadge isn't a boolean", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ settings: { showBadge: "yes" }, version: 0 }, "PATCH"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when the body has neither document nor settings", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ version: 0 }, "PATCH"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(400);
  });

  describe("optimistic concurrency (version)", () => {
    it("saves and returns the incremented version when version matches the row's current version", async () => {
      const { id } = await createTestInvitation();
      authMock.mockResolvedValue({ user: { id: userId } });

      const res = await PATCH(jsonRequest({ document: createDefaultDocument(), version: 0 }, "PATCH"), {
        params: Promise.resolve({ id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.version).toBe(1);

      const stored = await prisma.invitation.findUnique({ where: { id } });
      expect(stored?.version).toBe(1);
    });

    // THE load-bearing test: this is the exact data-loss bug the whole task
    // exists to close. Tab A and tab B both loaded version 0. Tab A saves
    // first (0 -> 1). Tab B, unaware, then tries to save against its own
    // (now stale) version 0. Before this feature, the second PATCH would
    // blindly `update()` and silently destroy tab A's write. The response
    // status alone isn't enough proof — the body could lie — so this reads
    // straight from the database afterward to confirm tab A's content
    // actually survived.
    it("returns 409 and does NOT overwrite the row when version is stale (two-tab overwrite scenario)", async () => {
      const { id } = await createTestInvitation();
      authMock.mockResolvedValue({ user: { id: userId } });

      const tabADoc = createDefaultDocument();
      tabADoc.theme.primary = "#AAAAAA";
      const tabAFirstSave = await PATCH(jsonRequest({ document: tabADoc, version: 0 }, "PATCH"), {
        params: Promise.resolve({ id }),
      });
      expect(tabAFirstSave.status).toBe(200);
      expect((await tabAFirstSave.json()).version).toBe(1);

      const tabBDoc = createDefaultDocument();
      tabBDoc.theme.primary = "#BBBBBB";
      const tabBStaleSave = await PATCH(jsonRequest({ document: tabBDoc, version: 0 }, "PATCH"), {
        params: Promise.resolve({ id }),
      });

      expect(tabBStaleSave.status).toBe(409);

      // Re-read from the database — never trust the response body for this
      // assertion. The row must still hold tab A's content and version,
      // completely untouched by tab B's rejected write.
      const stored = await prisma.invitation.findUnique({ where: { id } });
      expect((stored?.document as { theme: { primary: string } }).theme.primary).toBe("#AAAAAA");
      expect(stored?.version).toBe(1);
    });

    it("includes currentVersion in the 409 body so the client knows how far it's behind", async () => {
      const { id } = await createTestInvitation();
      authMock.mockResolvedValue({ user: { id: userId } });

      await PATCH(jsonRequest({ document: createDefaultDocument(), version: 0 }, "PATCH"), {
        params: Promise.resolve({ id }),
      });

      const staleRes = await PATCH(jsonRequest({ document: createDefaultDocument(), version: 0 }, "PATCH"), {
        params: Promise.resolve({ id }),
      });

      expect(staleRes.status).toBe(409);
      const body = await staleRes.json();
      expect(body.currentVersion).toBe(1);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns 400 when version is missing from the body", async () => {
      const { id } = await createTestInvitation();
      authMock.mockResolvedValue({ user: { id: userId } });

      const res = await PATCH(jsonRequest({ document: createDefaultDocument() }, "PATCH"), {
        params: Promise.resolve({ id }),
      });

      expect(res.status).toBe(400);
    });
  });
});

describe("DELETE /api/invitations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();

    const res = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);

    // The not-owned invitation must still exist afterward — a 404 must
    // never actually perform the delete.
    const stillThere = await prisma.invitation.findUnique({ where: { id } });
    expect(stillThere).not.toBeNull();
  });

  it("returns 200, deletes the row, and cascades to its Guest/Wish/FormSubmission rows", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const guest = await prisma.guest.create({ data: { invitationId: id, name: "Khách mời test" } });
    const wish = await prisma.wish.create({
      data: { invitationId: id, guestName: "Khách mời test", message: "Chúc mừng!" },
    });
    const submission = await prisma.formSubmission.create({
      data: { invitationId: id, sectionId: "form-section-test", data: { answer: "yes" } },
    });

    const res = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(200);

    const [invitationAfter, guestAfter, wishAfter, submissionAfter] = await Promise.all([
      prisma.invitation.findUnique({ where: { id } }),
      prisma.guest.findUnique({ where: { id: guest.id } }),
      prisma.wish.findUnique({ where: { id: wish.id } }),
      prisma.formSubmission.findUnique({ where: { id: submission.id } }),
    ]);
    expect(invitationAfter).toBeNull();
    expect(guestAfter).toBeNull();
    expect(wishAfter).toBeNull();
    expect(submissionAfter).toBeNull();
  });
});
