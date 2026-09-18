import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `auth()` has no session when a handler is called directly, and the queue is
// mocked so the enqueue-failure branch — impossible to trigger reliably
// against a live Redis — is reachable. The real queue round trip is covered
// by the worker package's own tests.
const { authMock, enqueueMock } = vi.hoisted(() => ({ authMock: vi.fn(), enqueueMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/queues", () => ({ enqueueBgRemovalJob: enqueueMock }));

import { POST } from "../images/background-removal/route";

let userId: string;
let otherUserId: string;
const createdAssetIds: string[] = [];

function request(body: unknown): Request {
  return new Request("http://localhost/api/images/background-removal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Returns the asset's canonical URL — what the editor actually holds and sends. */
async function createImageAsset(
  ownerId: string,
  overrides: { status?: string; kind?: "image" | "audio" | "font"; variants?: { width: number; url: string }[] } = {},
): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  await prisma.mediaAsset.create({
    data: {
      id,
      userId: ownerId,
      kind: overrides.kind ?? "image",
      url: `https://cdn.test/u/${ownerId}/${id}-800.webp`,
      status: overrides.status ?? "ready",
      meta: {
        width: 1200,
        height: 800,
        variants: overrides.variants ?? [
          { width: 400, url: `https://cdn.test/u/${ownerId}/${id}-400.webp` },
          { width: 800, url: `https://cdn.test/u/${ownerId}/${id}-800.webp` },
        ],
      },
    },
  });
  createdAssetIds.push(id);
  return { id, url: `https://cdn.test/u/${ownerId}/${id}-800.webp` };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `nobg-${randomUUID()}@test.local`, name: "Background Removal Test" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `nobg-other-${randomUUID()}@test.local`, name: "Other" },
  });
  otherUserId = other.id;
});

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: userId } });
  enqueueMock.mockResolvedValue("job-1");
});

afterEach(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  createdAssetIds.length = 0;
});

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
});

describe("POST /api/images/background-removal", () => {
  it("rejects an anonymous request", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(request({ url: (await createImageAsset(userId)).url }));

    expect(response.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("creates a NEW asset and queues the job, leaving the original alone", async () => {
    // The original must survive: "xoá nền" looks destructive on a wedding
    // photo, and the couple has to be able to undo it.
    const source = await createImageAsset(userId);
    const sourceId = source.id;

    const response = await POST(request({ url: source.url }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assetId).not.toBe(sourceId);
    expect(body.status).toBe("processing");

    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: sourceId } });
    expect(stored.status).toBe("ready");
    expect(stored.url).toContain(`${sourceId}-800.webp`);

    const target = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: body.assetId } });
    expect(target.status).toBe("processing");
    expect(target.url).toBe("");
    expect(target.meta).toMatchObject({ sourceAssetId: sourceId, width: 1200, height: 800 });
  });

  it("hands the worker the LARGEST variant's key, not the smallest", async () => {
    // The model should work from the most detail available; picking the
    // 400px thumbnail would produce a cut-out too small to use.
    const source = await createImageAsset(userId);

    await POST(request({ url: source.url }));

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: `u/${userId}/${source.id}-800.webp`,
        userId,
        sourceAssetId: source.id,
      }),
    );
  });

  it("returns 404 — not 403 — for someone else's photo, and queues nothing", async () => {
    const response = await POST(request({ url: (await createImageAsset(otherUserId)).url }));

    expect(response.status).toBe(404);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("returns an identical 404 for an asset that does not exist, so ids cannot be probed", async () => {
    const missing = await POST(request({ url: "https://cdn.test/u/nobody/nope-800.webp" }));
    const notMine = await POST(request({ url: (await createImageAsset(otherUserId)).url }));

    expect(missing.status).toBe(404);
    expect(notMine.status).toBe(404);
    expect(await missing.json()).toEqual(await notMine.json());
  });

  it("refuses a non-image asset", async () => {
    const audio = await createImageAsset(userId, { kind: "audio" });

    const response = await POST(request({ url: audio.url }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/ảnh/i);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("refuses a source that has not finished processing", async () => {
    const pending = await createImageAsset(userId, { status: "processing" });

    const response = await POST(request({ url: pending.url }));

    expect(response.status).toBe(409);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("refuses a source with no stored variants", async () => {
    const noVariants = await createImageAsset(userId, { variants: [] });

    const response = await POST(request({ url: noVariants.url }));

    expect(response.status).toBe(400);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed body", async () => {
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ url: 42 }))).status).toBe(400);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("marks the new asset failed and answers 503 when the queue is unreachable", async () => {
    // Not fail-open: reporting success would leave the editor polling a
    // status nothing will ever change.
    enqueueMock.mockRejectedValue(new Error("redis down"));
    const source = await createImageAsset(userId);

    const response = await POST(request({ url: source.url }));

    expect(response.status).toBe(503);
    const created = await prisma.mediaAsset.findMany({ where: { userId, id: { not: source.id } } });
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("failed");
  });
});
