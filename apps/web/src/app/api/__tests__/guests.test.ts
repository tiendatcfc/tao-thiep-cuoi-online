import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as `invitations-id.test.ts`: `auth()` is mocked because
// there's no real browser session when calling route handlers directly;
// everything else (Postgres) is real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET, POST } from "../invitations/[id]/guests/route";
import { DELETE, PATCH } from "../invitations/[id]/guests/[guestId]/route";

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];

async function createTestInvitation(ownerId: string = userId): Promise<{ id: string; slug: string }> {
  const slug = `test-guests-${randomUUID()}`;
  const document = createDefaultDocument();
  const invitation = await prisma.invitation.create({
    data: { slug, userId: ownerId, document, status: "draft" },
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
    data: { email: `guests-test-${randomUUID()}@test.local`, name: "Guests Test User" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `guests-test-other-${randomUUID()}@test.local`, name: "Other User" },
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
    // Guest rows cascade-delete with their invitation (schema.prisma).
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
});

describe("GET /api/invitations/[id]/guests", () => {
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

  it("returns guests newest first", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });
    const now = Date.now();
    await prisma.guest.create({
      data: { invitationId: id, name: "Old", createdAt: new Date(now - 2000) },
    });
    await prisma.guest.create({
      data: { invitationId: id, name: "New", createdAt: new Date(now) },
    });

    const res = await GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guests.map((g: { name: string }) => g.name)).toEqual(["New", "Old"]);
    expect(Object.keys(body.guests[0]).sort()).toEqual(
      ["createdAt", "group", "id", "name", "note", "token", "viewedAt"].sort(),
    );
  });
});

describe("POST /api/invitations/[id]/guests", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();

    const res = await POST(jsonRequest({ guests: [{ name: "A" }] }, "POST"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await POST(jsonRequest({ guests: [{ name: "A" }] }, "POST"), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await POST(jsonRequest({ guests: [{ name: "A" }] }, "POST"), {
      params: Promise.resolve({ id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);
  });

  it("creates multiple guests at once, each with a unique token", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(
      jsonRequest({ guests: [{ name: "Nguyễn Văn An" }, { name: "Trần Thị Bình" }] }, "POST"),
      { params: Promise.resolve({ id }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.guests).toHaveLength(2);
    expect(new Set(body.guests.map((g: { token: string }) => g.token)).size).toBe(2);
    expect(new Set(body.guests.map((g: { id: string }) => g.id)).size).toBe(2);

    const stored = await prisma.guest.findMany({ where: { invitationId: id } });
    expect(stored).toHaveLength(2);
  });

  it("normalizes names before storing", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ guests: [{ name: "  Lê   Văn  C  " }] }, "POST"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guests[0].name).toBe("Lê Văn C");
    const stored = await prisma.guest.findUnique({ where: { id: body.guests[0].id } });
    expect(stored?.name).toBe("Lê Văn C");
  });

  it("stores group/note when provided, trimmed, and null when omitted", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(
      jsonRequest(
        { guests: [{ name: "A", group: "  Họ nội  ", note: "  ăn chay  " }, { name: "B" }] },
        "POST",
      ),
      { params: Promise.resolve({ id }) },
    );

    const body = await res.json();
    const withGroup = body.guests.find((g: { name: string }) => g.name === "A");
    const withoutGroup = body.guests.find((g: { name: string }) => g.name === "B");
    expect(withGroup.group).toBe("Họ nội");
    expect(withGroup.note).toBe("ăn chay");
    expect(withoutGroup.group).toBeNull();
    expect(withoutGroup.note).toBeNull();
  });

  it("rejects an empty name after normalization with a Vietnamese message, and creates nothing", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ guests: [{ name: "Valid" }, { name: "   " }] }, "POST"), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tên/i);

    const stored = await prisma.guest.findMany({ where: { invitationId: id } });
    expect(stored).toHaveLength(0);
  });

  it("rejects more than 500 guests in one request", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const guests = Array.from({ length: 501 }, (_, i) => ({ name: `Guest ${i}` }));
    const res = await POST(jsonRequest({ guests }, "POST"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(400);
    const stored = await prisma.guest.findMany({ where: { invitationId: id } });
    expect(stored).toHaveLength(0);
  });

  it("accepts exactly 500 guests in one request", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const guests = Array.from({ length: 500 }, (_, i) => ({ name: `Guest ${i}` }));
    const res = await POST(jsonRequest({ guests }, "POST"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(500);
    expect(body.guests).toHaveLength(500);
  });

  it("rejects an empty guests array with 400", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ guests: [] }, "POST"), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(400);
  });

  it("returns 400 when the request body isn't valid JSON", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id }) },
    );

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/invitations/[id]/guests/[guestId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });

    const res = await PATCH(jsonRequest({ name: "New" }, "PATCH"), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await PATCH(jsonRequest({ name: "New" }, "PATCH"), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}`, guestId: `no-such-guest-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await PATCH(jsonRequest({ name: "New" }, "PATCH"), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);
  });

  it("updates name and keeps the token unchanged", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "Before" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ name: "  After   Update  " }, "PATCH"), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guest.name).toBe("After Update");
    expect(body.guest.token).toBe(guest.token);

    const stored = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(stored?.name).toBe("After Update");
    expect(stored?.token).toBe(guest.token);
  });

  it("updates group/note, and can clear them back to null", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({
      data: { invitationId: id, name: "G", group: "Họ nội", note: "cũ" },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ group: null, note: null }, "PATCH"), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guest.group).toBeNull();
    expect(body.guest.note).toBeNull();
  });

  it("rejects an empty name after normalization", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "Before" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ name: "   " }, "PATCH"), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(400);
    const stored = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(stored?.name).toBe("Before");
  });

  it("returns 404, and makes no change, when guestId belongs to a different invitation", async () => {
    const invA = await createTestInvitation();
    const invB = await createTestInvitation();
    const guestOnB = await prisma.guest.create({ data: { invitationId: invB.id, name: "On B" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ name: "Hijacked" }, "PATCH"), {
      params: Promise.resolve({ id: invA.id, guestId: guestOnB.id }),
    });

    expect(res.status).toBe(404);
    const stillOnB = await prisma.guest.findUnique({ where: { id: guestOnB.id } });
    expect(stillOnB?.name).toBe("On B");
    expect(stillOnB?.invitationId).toBe(invB.id);
  });

  it("returns 400 when the request body isn't valid JSON", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(
      new Request("http://localhost/api/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id, guestId: guest.id }) },
    );

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/invitations/[id]/guests/[guestId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });

    const res = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}`, guestId: `no-such-guest-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);

    // A 404 must never actually perform the delete.
    const stillThere = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes the guest and returns {ok: true}", async () => {
    const { id } = await createTestInvitation();
    const guest = await prisma.guest.create({ data: { invitationId: id, name: "G" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id, guestId: guest.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(stored).toBeNull();
  });

  it("returns 404, and does not delete, when guestId belongs to a different invitation", async () => {
    const invA = await createTestInvitation();
    const invB = await createTestInvitation();
    const guestOnB = await prisma.guest.create({ data: { invitationId: invB.id, name: "On B" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), {
      params: Promise.resolve({ id: invA.id, guestId: guestOnB.id }),
    });

    expect(res.status).toBe(404);
    const stillOnB = await prisma.guest.findUnique({ where: { id: guestOnB.id } });
    expect(stillOnB).not.toBeNull();
  });
});
