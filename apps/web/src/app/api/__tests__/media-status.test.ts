import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "../media/[assetId]/route";

let userId: string;
let otherUserId: string;
const createdAssetIds: string[] = [];

function statusRequest(assetId: string): [Request, { params: Promise<{ assetId: string }> }] {
  return [
    new Request(`http://localhost/api/media/${assetId}`),
    { params: Promise.resolve({ assetId }) },
  ];
}

async function createAsset(status: string, ownerId = userId, url = "http://localhost:9000/hpwd/u/x/y.m4a") {
  const asset = await prisma.mediaAsset.create({
    data: { userId: ownerId, kind: "audio", url, status, meta: { sourceKey: "u/x/y-source.mp3" } },
  });
  createdAssetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `media-status-${randomUUID()}@test.local`, name: "Media Status Test" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `media-status-other-${randomUUID()}@test.local`, name: "Other" },
  });
  otherUserId = other.id;
});

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: userId } });
});

afterEach(async () => {
  if (createdAssetIds.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
    createdAssetIds.length = 0;
  }
});

describe("GET /api/media/[assetId]", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue(null);
    const id = await createAsset("ready");

    expect((await GET(...statusRequest(id))).status).toBe(401);
  });

  it("returns an identical 404 whether the asset is missing or owned by someone else", async () => {
    const missing = await GET(...statusRequest(`no-such-asset-${randomUUID()}`));
    const notOwned = await GET(...statusRequest(await createAsset("ready", otherUserId)));

    expect(missing.status).toBe(404);
    expect(notOwned.status).toBe(404);
    // A different message would confirm to a stranger that the id exists.
    expect(await missing.json()).toEqual(await notOwned.json());
  });

  it("withholds the URL while the track is still processing", async () => {
    // The stored `url` is the raw uploaded file at this point. Handing it
    // over would let the editor play (and the couple keep) an untranscoded
    // file that may not decode in every browser.
    const body = await (await GET(...statusRequest(await createAsset("processing")))).json();

    expect(body.status).toBe("processing");
    expect(body.url).toBeNull();
  });

  it("returns the playable URL once the track is ready", async () => {
    const id = await createAsset("ready", userId, "http://localhost:9000/hpwd/u/u1/a1.m4a");

    const body = await (await GET(...statusRequest(id))).json();

    expect(body.status).toBe("ready");
    expect(body.url).toBe("http://localhost:9000/hpwd/u/u1/a1.m4a");
  });

  it("reports failure without leaking the internal error text", async () => {
    const asset = await prisma.mediaAsset.create({
      data: {
        userId,
        kind: "audio",
        url: "http://localhost:9000/hpwd/u/x/y-source.mp3",
        status: "failed",
        meta: { error: "ffmpeg failed: /var/folders/xy/hpwd-audio-abc/source: Invalid data" },
      },
    });
    createdAssetIds.push(asset.id);

    const res = await GET(...statusRequest(asset.id));
    const raw = await res.text();

    expect(JSON.parse(raw).status).toBe("failed");
    expect(JSON.parse(raw).url).toBeNull();
    // ffmpeg's stderr carries server filesystem paths; it belongs in the
    // worker log, not in a response to a browser.
    expect(raw).not.toMatch(/var\/folders|ffmpeg/i);
  });

  it("is never cached, because it is polled until the status changes", async () => {
    const res = await GET(...statusRequest(await createAsset("processing")));

    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
