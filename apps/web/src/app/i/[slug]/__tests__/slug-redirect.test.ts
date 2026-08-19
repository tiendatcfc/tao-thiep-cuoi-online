import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as `publish.test.ts`: `auth()` is mocked because there's no
// real browser session when calling the publish route handler directly, and
// `revalidatePath` needs Next's request-scoped async-storage context, which
// doesn't exist outside a real Next server.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { POST as publish } from "../../../api/invitations/[id]/publish/route";
import PublicInvitationPage, { generateMetadata } from "../page";

/**
 * `notFound()`/`permanentRedirect()` talk to the App Router by throwing an
 * `Error` whose `.digest` encodes the outcome — that's Next's own (internal
 * but stable) control-flow-error contract, see
 * `next/dist/client/components/{not-found,redirect}.js`. Calling these page
 * functions directly (no real Next server / request context) still throws
 * that same error, so this captures it instead of letting a normal render
 * happen.
 */
async function captureControlFlowDigest(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string"
    ) {
      return (error as { digest: string }).digest;
    }
    throw error;
  }
  throw new Error("expected the page function to throw a redirect/notFound, but it returned normally");
}

let userId: string;
let otherUserId: string;
const createdInvitationIds: string[] = [];

async function createUser(email: string): Promise<string> {
  const user = await prisma.user.create({ data: { email, name: "Slug Redirect Test User" } });
  return user.id;
}

async function createInvitation(overrides: {
  slug: string;
  status?: "draft" | "published";
  ownerId?: string;
}): Promise<string> {
  const document = createDefaultDocument();
  const status = overrides.status ?? "published";
  const invitation = await prisma.invitation.create({
    data: {
      slug: overrides.slug,
      userId: overrides.ownerId ?? userId,
      document: document as never,
      publishedDocument: status === "published" ? (document as never) : undefined,
      status,
      publishedAt: status === "published" ? new Date() : undefined,
    },
  });
  createdInvitationIds.push(invitation.id);
  return invitation.id;
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  userId = await createUser(`slug-redirect-${randomUUID()}@test.local`);
  otherUserId = await createUser(`slug-redirect-other-${randomUUID()}@test.local`);
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

describe("/i/[slug] — historical slug redirects (load-bearing)", () => {
  it("publishing a, then re-publishing as b: GET /i/a permanently redirects to /i/b, preserving ?g=", async () => {
    const id = await createInvitation({ slug: `lb1-draft-${randomUUID()}`, status: "draft" });
    authMock.mockResolvedValue({ user: { id: userId } });

    const slugA = `lb1-a-${randomUUID()}`;
    expect((await publish(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id }) })).status).toBe(
      200,
    );

    const slugB = `lb1-b-${randomUUID()}`;
    expect((await publish(jsonRequest({ slug: slugB }), { params: Promise.resolve({ id }) })).status).toBe(
      200,
    );

    const plainDigest = await captureControlFlowDigest(() =>
      PublicInvitationPage({ params: Promise.resolve({ slug: slugA }), searchParams: Promise.resolve({}) }),
    );
    expect(plainDigest).toBe(`NEXT_REDIRECT;replace;/i/${slugB};308;`);

    const token = `lb1-guest-${randomUUID()}`;
    const withGuestDigest = await captureControlFlowDigest(() =>
      PublicInvitationPage({
        params: Promise.resolve({ slug: slugA }),
        searchParams: Promise.resolve({ g: token }),
      }),
    );
    expect(withGuestDigest).toBe(`NEXT_REDIRECT;replace;/i/${slugB}?g=${token};308;`);
  });

  it("X publishes a then b; Y (a different owner) publishing a gets 409, and a still redirects to X's current slug afterward", async () => {
    const xId = await createInvitation({ slug: `lb2-x-draft-${randomUUID()}`, status: "draft" });
    authMock.mockResolvedValue({ user: { id: userId } });

    const slugA = `lb2-a-${randomUUID()}`;
    expect((await publish(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id: xId }) })).status).toBe(
      200,
    );
    const slugB = `lb2-b-${randomUUID()}`;
    expect((await publish(jsonRequest({ slug: slugB }), { params: Promise.resolve({ id: xId }) })).status).toBe(
      200,
    );

    const yId = await createInvitation({
      slug: `lb2-y-draft-${randomUUID()}`,
      status: "draft",
      ownerId: otherUserId,
    });
    authMock.mockResolvedValue({ user: { id: otherUserId } });
    const squatAttempt = await publish(jsonRequest({ slug: slugA }), { params: Promise.resolve({ id: yId }) });
    expect(squatAttempt.status).toBe(409);

    const digest = await captureControlFlowDigest(() =>
      PublicInvitationPage({ params: Promise.resolve({ slug: slugA }), searchParams: Promise.resolve({}) }),
    );
    expect(digest).toBe(`NEXT_REDIRECT;replace;/i/${slugB};308;`);
  });
});

describe("/i/[slug] — redirect edge cases", () => {
  it("returns 404 (no redirect) for a slug that has never existed", async () => {
    const digest = await captureControlFlowDigest(() =>
      PublicInvitationPage({
        params: Promise.resolve({ slug: `never-existed-${randomUUID()}` }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("does not reveal an invitation that has since gone back to draft — 404 instead of redirecting", async () => {
    const id = await createInvitation({ slug: `draft-current-${randomUUID()}`, status: "draft" });
    const oldSlug = `old-of-draft-${randomUUID()}`;
    await prisma.invitationSlug.create({ data: { slug: oldSlug, invitationId: id } });

    const digest = await captureControlFlowDigest(() =>
      PublicInvitationPage({ params: Promise.resolve({ slug: oldSlug }), searchParams: Promise.resolve({}) }),
    );
    expect(digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("generateMetadata also redirects a historical slug to the invitation's current one", async () => {
    const id = await createInvitation({ slug: `gm-current-${randomUUID()}`, status: "published" });
    const currentSlug = (await prisma.invitation.findUnique({ where: { id } }))?.slug;
    const oldSlug = `gm-old-${randomUUID()}`;
    await prisma.invitationSlug.create({ data: { slug: oldSlug, invitationId: id } });

    const digest = await captureControlFlowDigest(() =>
      generateMetadata({ params: Promise.resolve({ slug: oldSlug }), searchParams: Promise.resolve({}) }),
    );
    expect(digest).toBe(`NEXT_REDIRECT;replace;/i/${currentSlug};308;`);
  });

  it("generateMetadata does not throw and returns empty metadata for a slug that has never existed", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: `gm-never-${randomUUID()}` }) }),
    ).resolves.toEqual({});
  });
});
