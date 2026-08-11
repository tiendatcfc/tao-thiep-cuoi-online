import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument, type InvitationDocument, type Section } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rate limiting and auth are mocked per the brief's explicit resolution
// ("prefer mocking the rate-limit module for determinism") — `rate-limit.ts`
// itself already has a dedicated real-Redis test suite
// (src/lib/__tests__/rate-limit.test.ts), so re-exercising real Redis here
// would just add flakiness without covering anything new. `auth()` is
// mocked because there's no real browser session to authenticate with when
// calling route handlers directly.
const { rateLimitMock, authMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
  authMock: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET, POST } from "../invites/[slug]/wishes/route";
import { PATCH } from "../invitations/[id]/wishes/[wishId]/route";

// ---------------------------------------------------------------------------
// Fixtures — real Postgres (docker `hpwd-postgres`), no Prisma mocking. Every
// invitation created by a test is tracked and deleted in `afterEach`; `Wish`
// rows cascade-delete with their invitation (see schema.prisma), so nothing
// else needs manual cleanup.
// ---------------------------------------------------------------------------

let userId: string;
const createdInvitationIds: string[] = [];

function buildWishesDocument(requireApproval: boolean): InvitationDocument {
  const document = createDefaultDocument();
  const wishesSection = document.sections.find(
    (section): section is Extract<Section, { type: "wishes" }> => section.type === "wishes",
  );
  if (!wishesSection) {
    throw new Error("Fixture invalid: createDefaultDocument() has no wishes section");
  }
  wishesSection.props.requireApproval = requireApproval;
  return document;
}

async function createTestInvitation(
  opts: { requireApproval?: boolean; published?: boolean } = {},
): Promise<{ id: string; slug: string }> {
  const { requireApproval = false, published = true } = opts;
  const slug = `test-wishes-${randomUUID()}`;
  const document = buildWishesDocument(requireApproval);

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
  return { id: invitation.id, slug };
}

function jsonRequest(body: unknown, method: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `wishes-test-${randomUUID()}@test.local`, name: "Wishes Test User" },
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
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
});

describe("POST /api/invites/[slug]/wishes", () => {
  it("creates a Wish visible right away and returns exactly {id, guestName, message, createdAt}", async () => {
    const { slug, id: invitationId } = await createTestInvitation();

    const res = await POST(
      jsonRequest({ guestName: "Nguyễn Văn A", message: "Chúc hai bạn trăm năm hạnh phúc!" }, "POST"),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body.wish).sort()).toEqual(["createdAt", "guestName", "id", "message"]);
    expect(body.wish.guestName).toBe("Nguyễn Văn A");
    expect(body.wish.message).toBe("Chúc hai bạn trăm năm hạnh phúc!");

    const stored = await prisma.wish.findUnique({ where: { id: body.wish.id } });
    expect(stored?.invitationId).toBe(invitationId);
    expect(stored?.isHidden).toBe(false);
  });

  it("trims whitespace from guestName and message before storing", async () => {
    const { slug } = await createTestInvitation();

    const res = await POST(
      jsonRequest({ guestName: "  Bé Na  ", message: "  Chúc mừng!  " }, "POST"),
      { params: Promise.resolve({ slug }) },
    );

    const body = await res.json();
    expect(body.wish.guestName).toBe("Bé Na");
    expect(body.wish.message).toBe("Chúc mừng!");
  });

  it("rejects a message over 500 characters with 400", async () => {
    const { slug } = await createTestInvitation();

    const res = await POST(
      jsonRequest({ guestName: "Khách", message: "x".repeat(501) }, "POST"),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("rejects an empty guestName with 400", async () => {
    const { slug } = await createTestInvitation();

    const res = await POST(
      jsonRequest({ guestName: "   ", message: "Chúc mừng" }, "POST"),
      { params: Promise.resolve({ slug }) },
    );

    expect(res.status).toBe(400);
  });

  it("returns 429 once the rate limiter throttles the request (6th POST/min from the same IP)", async () => {
    const { slug } = await createTestInvitation();
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(true);
    rateLimitMock.mockResolvedValueOnce(false);

    const statuses: number[] = [];
    let sixthBody: { error?: string } = {};
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        jsonRequest({ guestName: "Khách", message: `Chúc mừng lần ${i}` }, "POST", {
          "x-forwarded-for": "203.0.113.9",
        }),
        { params: Promise.resolve({ slug }) },
      );
      statuses.push(res.status);
      if (i === 5) sixthBody = await res.json();
    }

    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(rateLimitMock).toHaveBeenCalledWith(`wish:203.0.113.9:${slug}`, { limit: 5, windowSec: 60 });
    expect(sixthBody.error).toBe("Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút.");
  });

  it("falls back to x-real-ip, then 'unknown', when x-forwarded-for is absent", async () => {
    const { slug } = await createTestInvitation();

    await POST(jsonRequest({ guestName: "A", message: "B" }, "POST", { "x-real-ip": "198.51.100.4" }), {
      params: Promise.resolve({ slug }),
    });
    expect(rateLimitMock).toHaveBeenCalledWith(`wish:198.51.100.4:${slug}`, { limit: 5, windowSec: 60 });

    await POST(jsonRequest({ guestName: "A", message: "B" }, "POST"), { params: Promise.resolve({ slug }) });
    expect(rateLimitMock).toHaveBeenCalledWith(`wish:unknown:${slug}`, { limit: 5, windowSec: 60 });
  });

  it("creates the wish already hidden when the wishes section has requireApproval: true", async () => {
    const { slug } = await createTestInvitation({ requireApproval: true });

    const res = await POST(jsonRequest({ guestName: "Khách", message: "Chúc mừng" }, "POST"), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const stored = await prisma.wish.findUnique({ where: { id: body.wish.id } });
    expect(stored?.isHidden).toBe(true);
  });

  it("returns 404 when the invitation exists but is not published", async () => {
    const { slug } = await createTestInvitation({ published: false });

    const res = await POST(jsonRequest({ guestName: "Khách", message: "Chúc mừng" }, "POST"), {
      params: Promise.resolve({ slug }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a slug that doesn't exist", async () => {
    const res = await POST(jsonRequest({ guestName: "Khách", message: "Chúc mừng" }, "POST"), {
      params: Promise.resolve({ slug: `no-such-slug-${randomUUID()}` }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/invites/[slug]/wishes", () => {
  it("returns only visible wishes, newest first, excluding isHidden ones", async () => {
    const { slug, id: invitationId } = await createTestInvitation();
    const now = Date.now();
    await prisma.wish.create({
      data: { invitationId, guestName: "Old", message: "old", createdAt: new Date(now - 2000) },
    });
    const hidden = await prisma.wish.create({
      data: {
        invitationId,
        guestName: "Hidden",
        message: "hidden",
        isHidden: true,
        createdAt: new Date(now - 1000),
      },
    });
    await prisma.wish.create({
      data: { invitationId, guestName: "New", message: "new", createdAt: new Date(now) },
    });

    const res = await GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ slug }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishes.map((w: { guestName: string }) => w.guestName)).toEqual(["New", "Old"]);
    expect(body.wishes.some((w: { id: string }) => w.id === hidden.id)).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("paginates at 20 per page via cursor", async () => {
    const { slug, id: invitationId } = await createTestInvitation();
    const now = Date.now();
    for (let i = 0; i < 21; i++) {
      await prisma.wish.create({
        data: {
          invitationId,
          guestName: `Guest ${i}`,
          message: "hi",
          createdAt: new Date(now - i * 1000),
        },
      });
    }

    const firstPage = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ slug }),
    });
    const firstBody = await firstPage.json();
    expect(firstBody.wishes).toHaveLength(20);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    // Newest first: "Guest 0" has the latest createdAt.
    expect(firstBody.wishes[0].guestName).toBe("Guest 0");

    const secondPage = await GET(
      new Request(`http://localhost/api/test?cursor=${firstBody.nextCursor}`),
      { params: Promise.resolve({ slug }) },
    );
    const secondBody = await secondPage.json();
    expect(secondBody.wishes).toHaveLength(1);
    expect(secondBody.wishes[0].guestName).toBe("Guest 20");
    expect(secondBody.nextCursor).toBeNull();
  });

  it("returns 404 for a slug that doesn't exist", async () => {
    const res = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ slug: `no-such-slug-${randomUUID()}` }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/invitations/[id]/wishes/[wishId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id: invitationId } = await createTestInvitation();
    const wish = await prisma.wish.create({ data: { invitationId, guestName: "G", message: "M" } });
    authMock.mockResolvedValue(null);

    const res = await PATCH(jsonRequest({ isHidden: true }, "PATCH"), {
      params: Promise.resolve({ id: invitationId, wishId: wish.id }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when the invitation belongs to a different user", async () => {
    const { id: invitationId } = await createTestInvitation();
    const wish = await prisma.wish.create({ data: { invitationId, guestName: "G", message: "M" } });
    authMock.mockResolvedValue({ user: { id: "someone-else-entirely" } });

    const res = await PATCH(jsonRequest({ isHidden: true }, "PATCH"), {
      params: Promise.resolve({ id: invitationId, wishId: wish.id }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 200 and toggles isHidden for the owner", async () => {
    const { id: invitationId } = await createTestInvitation();
    const wish = await prisma.wish.create({
      data: { invitationId, guestName: "G", message: "M", isHidden: false },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ isHidden: true }, "PATCH"), {
      params: Promise.resolve({ id: invitationId, wishId: wish.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wish.isHidden).toBe(true);
    const stored = await prisma.wish.findUnique({ where: { id: wish.id } });
    expect(stored?.isHidden).toBe(true);
  });

  it("returns 404 when the wish belongs to a different invitation", async () => {
    const invA = await createTestInvitation();
    const invB = await createTestInvitation();
    const wishOnB = await prisma.wish.create({
      data: { invitationId: invB.id, guestName: "G", message: "M" },
    });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await PATCH(jsonRequest({ isHidden: true }, "PATCH"), {
      params: Promise.resolve({ id: invA.id, wishId: wishOnB.id }),
    });

    expect(res.status).toBe(404);
  });
});
