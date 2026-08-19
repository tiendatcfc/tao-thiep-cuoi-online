import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as `invitations-id.test.ts`: `auth()` is mocked because
// there's no real browser session when calling route handlers directly;
// everything else (Postgres) is real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

// `revalidatePath` needs Next's request-scoped async-storage context, which
// doesn't exist when a test calls the route handler function directly
// (rather than going through the real Next server) — calling the real one
// here would throw "Invariant: static generation store missing in
// revalidatePath ...". Mocking it (same idea as `auth` above) also lets
// tests assert it fires with the right path on a successful publish.
const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { PATCH } from "../invitations/[id]/route";
import { POST } from "../invitations/[id]/publish/route";

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];

async function createTestInvitation(overrides: {
  slug?: string;
  document?: unknown;
  status?: "draft" | "published";
  ownerId?: string;
} = {}): Promise<{ id: string; slug: string }> {
  const slug = overrides.slug ?? `test-publish-${randomUUID()}`;
  const document = overrides.document ?? createDefaultDocument();
  const invitation = await prisma.invitation.create({
    data: {
      slug,
      userId: overrides.ownerId ?? userId,
      // `document` is an untyped Json column — tests need to be able to
      // write deliberately-invalid shapes to exercise the 400 path below.
      document: document as never,
      status: overrides.status ?? "draft",
    },
  });
  createdInvitationIds.push(invitation.id);
  return { id: invitation.id, slug };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `publish-test-${randomUUID()}@test.local`, name: "Publish Test User" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `publish-test-other-${randomUUID()}@test.local`, name: "Other User" },
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
  revalidatePathMock.mockReset();
});

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
});

describe("POST /api/invitations/[id]/publish", () => {
  it("returns 401 when unauthenticated", async () => {
    const { id } = await createTestInvitation();

    const res = await POST(jsonRequest({ slug: "valid-slug" }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 with an identical body whether the invitation is missing or owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const missingRes = await POST(jsonRequest({ slug: "valid-slug" }), {
      params: Promise.resolve({ id: `no-such-id-${randomUUID()}` }),
    });

    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const notOwnedRes = await POST(jsonRequest({ slug: "valid-slug" }), {
      params: Promise.resolve({ id }),
    });

    expect(missingRes.status).toBe(404);
    expect(notOwnedRes.status).toBe(404);
    const [missingBody, notOwnedBody] = await Promise.all([missingRes.json(), notOwnedRes.json()]);
    expect(missingBody).toEqual(notOwnedBody);
  });

  it("returns 400 with a Vietnamese message when the slug fails the format regex", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ slug: "Đám Cưới!" }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
  });

  it("returns 400 when the slug is too short", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ slug: "ab" }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(400);
  });

  it("returns 409 with a Vietnamese message when the slug is taken by a different invitation", async () => {
    const takenSlug = `taken-${randomUUID()}`;
    await createTestInvitation({ slug: takenSlug });
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ slug: takenSlug }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("succeeds when re-publishing with the invitation's own current slug (not a conflict)", async () => {
    const ownSlug = `own-${randomUUID()}`;
    const { id } = await createTestInvitation({ slug: ownSlug });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ slug: ownSlug }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe(ownSlug);
  });

  it("returns 400 with a Vietnamese message when the current draft document fails schema validation", async () => {
    const { id } = await createTestInvitation({ document: { version: 1, sections: "not-an-array" } });
    authMock.mockResolvedValue({ user: { id: userId } });

    const res = await POST(jsonRequest({ slug: `valid-slug-${randomUUID()}` }), {
      params: Promise.resolve({ id }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
  });

  it("publishes: 200 {slug, publishedAt}, snapshots document into publishedDocument, sets status/publishedAt, and revalidates /i/[slug]", async () => {
    const document = createDefaultDocument();
    document.theme.primary = "#123456";
    const { id } = await createTestInvitation({ document });
    authMock.mockResolvedValue({ user: { id: userId } });
    const newSlug = `published-${randomUUID()}`;

    const before = Date.now();
    const res = await POST(jsonRequest({ slug: newSlug }), { params: Promise.resolve({ id }) });
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe(newSlug);
    expect(typeof body.publishedAt).toBe("string");
    const publishedAtMs = new Date(body.publishedAt).getTime();
    expect(publishedAtMs).toBeGreaterThanOrEqual(before);
    expect(publishedAtMs).toBeLessThanOrEqual(after);

    const stored = await prisma.invitation.findUnique({ where: { id } });
    expect(stored?.slug).toBe(newSlug);
    expect(stored?.status).toBe("published");
    expect(stored?.publishedAt).not.toBeNull();
    // Snapshot equality: publishedDocument matches the draft document at
    // the moment of publishing.
    expect(stored?.publishedDocument).toEqual(JSON.parse(JSON.stringify(document)));

    expect(revalidatePathMock).toHaveBeenCalledWith(`/i/${newSlug}`);
  });

  it("editing the draft after publishing, through the real PATCH handler, does not change the live publishedDocument", async () => {
    const document = createDefaultDocument();
    const { id } = await createTestInvitation({ document });
    authMock.mockResolvedValue({ user: { id: userId } });
    const slug = `isolation-${randomUUID()}`;

    const publishRes = await POST(jsonRequest({ slug }), { params: Promise.resolve({ id }) });
    expect(publishRes.status).toBe(200);

    const afterPublish = await prisma.invitation.findUnique({ where: { id } });
    const publishedSnapshot = afterPublish?.publishedDocument;

    // Edit the draft through the REAL autosave endpoint (not a raw prisma
    // write) — this is the task's dominant property (a future PATCH change
    // that started also writing `publishedDocument` would slip past a test
    // that bypasses the handler entirely), so it has to go through the
    // actual route the editor's autosave hits.
    const editedDocument = createDefaultDocument();
    editedDocument.theme.primary = "#FEDCBA";
    // Publishing (above) never touches `version` — it's a snapshot into
    // `publishedDocument`, not a draft edit — so the row is still at its
    // freshly-created version (0) here.
    const patchRes = await PATCH(
      new Request("http://localhost/api/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: editedDocument, version: 0 }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(patchRes.status).toBe(200);

    const afterEdit = await prisma.invitation.findUnique({ where: { id } });
    expect(afterEdit?.publishedDocument).toEqual(publishedSnapshot);
    expect((afterEdit?.document as { theme: { primary: string } }).theme.primary).toBe("#FEDCBA");
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

describe("POST /api/invitations/[id]/publish — slug history", () => {
  it("xuất bản lần đầu ghi slug vào lịch sử", async () => {
    const { id } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });
    const slug = `history-first-${randomUUID()}`;

    const res = await POST(jsonRequest({ slug }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const historyRow = await prisma.invitationSlug.findUnique({ where: { slug } });
    expect(historyRow?.invitationId).toBe(id);
  });

  it("đổi slug giữ lại slug cũ trong lịch sử và thêm slug mới", async () => {
    const slugA = `history-a-${randomUUID()}`;
    const { id } = await createTestInvitation({ slug: slugA });
    authMock.mockResolvedValue({ user: { id: userId } });

    const firstRes = await POST(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id }) });
    expect(firstRes.status).toBe(200);

    const slugB = `history-b-${randomUUID()}`;
    const secondRes = await POST(jsonRequest({ slug: slugB }), { params: Promise.resolve({ id }) });
    expect(secondRes.status).toBe(200);

    const [historyA, historyB] = await Promise.all([
      prisma.invitationSlug.findUnique({ where: { slug: slugA } }),
      prisma.invitationSlug.findUnique({ where: { slug: slugB } }),
    ]);
    expect(historyA?.invitationId).toBe(id);
    expect(historyB?.invitationId).toBe(id);

    const stored = await prisma.invitation.findUnique({ where: { id } });
    expect(stored?.slug).toBe(slugB);
  });

  it("409 khi slug đang nằm trong lịch sử của thiệp KHÁC (chống chiếm dụng), và slug cũ vẫn thuộc về chủ thiệp gốc", async () => {
    const slugA = `squat-a-${randomUUID()}`;
    const { id: xId } = await createTestInvitation({ slug: slugA });
    authMock.mockResolvedValue({ user: { id: userId } });
    const firstRes = await POST(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id: xId }) });
    expect(firstRes.status).toBe(200);

    const slugB = `squat-b-${randomUUID()}`;
    const moveRes = await POST(jsonRequest({ slug: slugB }), { params: Promise.resolve({ id: xId }) });
    expect(moveRes.status).toBe(200);

    // Y: a different invitation owned by a different user tries to claim
    // X's now-abandoned slug A.
    const { id: yId } = await createTestInvitation({ ownerId: otherUserId });
    authMock.mockResolvedValue({ user: { id: otherUserId } });

    const res = await POST(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id: yId }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);

    // Slug A must still belong to X unchanged, so it keeps redirecting to
    // X's current slug rather than being up for grabs.
    const historyA = await prisma.invitationSlug.findUnique({ where: { slug: slugA } });
    expect(historyA?.invitationId).toBe(xId);
    const stillX = await prisma.invitation.findUnique({ where: { id: xId } });
    expect(stillX?.slug).toBe(slugB);
  });

  it("cho phép quay lại slug cũ của CHÍNH mình", async () => {
    const slugOld = `own-old-${randomUUID()}`;
    const { id } = await createTestInvitation({ slug: slugOld });
    authMock.mockResolvedValue({ user: { id: userId } });
    const firstRes = await POST(jsonRequest({ slug: slugOld }), { params: Promise.resolve({ id }) });
    expect(firstRes.status).toBe(200);

    const slugNew = `own-new-${randomUUID()}`;
    const moveRes = await POST(jsonRequest({ slug: slugNew }), { params: Promise.resolve({ id }) });
    expect(moveRes.status).toBe(200);

    const res = await POST(jsonRequest({ slug: slugOld }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe(slugOld);
    const stored = await prisma.invitation.findUnique({ where: { id } });
    expect(stored?.slug).toBe(slugOld);
  });

  it("revalidate cả slug cũ lẫn slug mới khi đổi", async () => {
    const slugOld = `reval-old-${randomUUID()}`;
    const { id } = await createTestInvitation({ slug: slugOld });
    authMock.mockResolvedValue({ user: { id: userId } });
    const firstRes = await POST(jsonRequest({ slug: slugOld }), { params: Promise.resolve({ id }) });
    expect(firstRes.status).toBe(200);
    revalidatePathMock.mockClear();

    const slugNew = `reval-new-${randomUUID()}`;
    const res = await POST(jsonRequest({ slug: slugNew }), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/i/${slugOld}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/i/${slugNew}`);
  });
});

describe("POST /api/invitations/[id]/publish — slug-history TOCTOU (ownership re-checked inside the transaction)", () => {
  it("does not let a stale pre-check hand a slug-history row to an invitation that doesn't own it", async () => {
    // Simulates the exact interleaving a real race would produce: invitation
    // Z claimed `slugS` and later moved away from it, so `InvitationSlug`
    // still legitimately attributes `slugS` to Z even though `slugS` is
    // nobody's CURRENT slug any more. That row is seeded directly (real,
    // committed data) — no mocking involved for it.
    const slugS = `race-s-${randomUUID()}`;
    const { id: zId } = await createTestInvitation({ slug: `race-z-current-${randomUUID()}` });
    await prisma.invitationSlug.create({ data: { slug: slugS, invitationId: zId } });

    const { id: xId } = await createTestInvitation();
    authMock.mockResolvedValue({ user: { id: userId } });

    // Force X's OWN pre-check — the route's first call to
    // `invitationSlug.findUnique` — to see a stale "nothing claimed yet"
    // result, exactly what it would have seen had it run BEFORE Z's claim
    // and abandonment instead of after. `mockResolvedValueOnce` overrides
    // only that one call; anything else (including a re-check made through
    // the transaction's own `tx` client, which is a distinct object from
    // `prisma`) still hits the real, already-committed row seeded above.
    const findUniqueSpy = vi.spyOn(prisma.invitationSlug, "findUnique").mockResolvedValueOnce(null);

    try {
      const res = await POST(jsonRequest({ slug: slugS }), { params: Promise.resolve({ id: xId }) });

      // Pinned to the exact failure this bug produces: a blind
      // `upsert({ update: {} })` keyed only on `slug` returns 200 here and
      // silently leaves `InvitationSlug{slugS}` pointing at Z while
      // `Invitation(X).slug` becomes `slugS` — so X's own distributed link
      // would 308 to Z's current slug. `toBe(409)` fails loudly against
      // that version instead of passing by accident.
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body.error).toMatch(/[ạảãàáâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);

      // The slug-history row must still belong to Z, completely untouched.
      const historyRow = await prisma.invitationSlug.findUnique({ where: { slug: slugS } });
      expect(historyRow?.invitationId).toBe(zId);

      // And the rejected transaction must have rolled back in full — X's
      // OWN `Invitation.slug` must not have changed either, proving the
      // `Invitation.update` and the ownership re-check really share one
      // atomic transaction rather than the update having already committed
      // before the check ran.
      const stillX = await prisma.invitation.findUnique({ where: { id: xId } });
      expect(stillX?.slug).not.toBe(slugS);
    } finally {
      findUniqueSpy.mockRestore();
    }
  });
});
