import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same division as `uploads-audio.test.ts`: `auth()` has no session when a
// handler is called directly, and `putObject`/`deleteObject` are mocked so
// the route's own branches — including the storage failure, which cannot be
// triggered reliably against live MinIO — are reachable. `fontkit` and
// `wawoff2` are NOT mocked: they are the actual validation, and a fake
// would make every assertion below meaningless.
const { authMock, putObjectMock, deleteObjectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  putObjectMock: vi.fn(),
  deleteObjectMock: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, putObject: putObjectMock, deleteObject: deleteObjectMock };
});

import { MAX_FONT_SIZE_BYTES } from "@/lib/font";

import { POST } from "../uploads/font/route";
import { DELETE } from "../fonts/[assetId]/route";

/** See `font-server.test.ts` for why this fixture, and why it must fail rather than skip. */
const require = createRequire(import.meta.url);
const NOTO_SANS = readFileSync(
  path.join(
    path.dirname(require.resolve("next/package.json")),
    "dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
  ),
);

let userId: string;
let otherUserId: string;

function fontFile(name = "NotoSans.ttf", bytes: Buffer = NOTO_SANS): File {
  return new File([new Uint8Array(bytes)], name, { type: "font/ttf" });
}

/** A `Request` built in-process carries no content-length for FormData; the route requires one. */
async function multipartRequest(file: File | null, overrideLength?: string): Promise<Request> {
  const form = new FormData();
  if (file) form.append("file", file);
  const probe = new Request("http://localhost/api/uploads/font", { method: "POST", body: form });
  const contentType = probe.headers.get("content-type")!;
  const bytes = await probe.arrayBuffer();
  const headers: Record<string, string> = { "content-type": contentType };
  if (overrideLength !== undefined) {
    if (overrideLength !== "") headers["content-length"] = overrideLength;
  } else {
    headers["content-length"] = String(bytes.byteLength);
  }
  return new Request("http://localhost/api/uploads/font", { method: "POST", headers, body: bytes });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `font-upload-${randomUUID()}@test.local`, name: "Font Upload Test" },
  });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: `font-other-${randomUUID()}@test.local`, name: "Font Other" },
  });
  otherUserId = other.id;
});

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: userId } });
  putObjectMock.mockImplementation(async (key: string) => `https://cdn.test/${key}`);
  deleteObjectMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
});

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
});

describe("POST /api/uploads/font", () => {
  it("rejects an anonymous upload", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(await multipartRequest(fontFile()));

    expect(response.status).toBe(401);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("stores the converted WOFF2 and records a ready MediaAsset", async () => {
    const response = await POST(await multipartRequest(fontFile()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.family).toBe("Noto Sans");
    expect(body.url).toMatch(/\.woff2$/);

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: body.assetId } });
    expect(asset.kind).toBe("font");
    // "ready", not the column's "pending" default: no worker processes a
    // font, so anything else would leave it pending forever and trip the
    // operations runbook's stuck-asset query.
    expect(asset.status).toBe("ready");
    expect(asset.userId).toBe(userId);
  });

  it("uploads WOFF2 bytes under the asset's own key, whatever the file was called", async () => {
    const response = await POST(await multipartRequest(fontFile("Weird Name (1).ttf")));
    const body = await response.json();

    const [key, buffer, contentType] = putObjectMock.mock.calls[0];
    expect(key).toBe(`u/${userId}/${body.assetId}.woff2`);
    expect(contentType).toBe("font/woff2");
    expect(Buffer.from(buffer).subarray(0, 4).toString("latin1")).toBe("wOF2");
  });

  it("warns about missing Vietnamese glyphs without refusing the font", async () => {
    // A couple may knowingly pick a Latin-only display face. Refusing would
    // be the tool overruling them; saying nothing would let them publish an
    // invitation rendering their own names as boxes.
    const response = await POST(await multipartRequest(fontFile()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.missingGlyphs).toBe("ăđơưẮẰẲẴẶ");

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: body.assetId } });
    expect((asset.meta as { missingGlyphs?: string }).missingGlyphs).toBe("ăđơưẮẰẲẴẶ");
  });

  it("refuses a file whose extension is not one of the three supported formats", async () => {
    const response = await POST(await multipartRequest(fontFile("Roboto.woff")));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/TTF|OTF|WOFF2/i);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not a font, even when the name ends in .ttf", async () => {
    // The extension is a hint from the client. fontkit is the real check.
    const response = await POST(await multipartRequest(fontFile("fake.ttf", Buffer.from("not a font"))));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/không đọc được/i);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("refuses an oversized declared length before parsing the body at all", async () => {
    const response = await POST(
      await multipartRequest(fontFile(), String(MAX_FONT_SIZE_BYTES + 2 * 1024 * 1024)),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/5MB/);
  });

  it("refuses a request with no content-length, which is how an unbounded body arrives", async () => {
    const response = await POST(await multipartRequest(fontFile(), ""));

    expect(response.status).toBe(400);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("refuses a request with no file part", async () => {
    const response = await POST(await multipartRequest(null));

    expect(response.status).toBe(400);
  });

  it("writes no MediaAsset row when storage fails", async () => {
    putObjectMock.mockRejectedValue(new Error("MinIO down"));

    const response = await POST(await multipartRequest(fontFile()));

    expect(response.status).toBe(500);
    expect(await prisma.mediaAsset.count({ where: { userId } })).toBe(0);
  });
});

describe("DELETE /api/fonts/[assetId]", () => {
  async function createFontAsset(ownerId: string) {
    const id = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id,
        userId: ownerId,
        kind: "font",
        url: `https://cdn.test/u/${ownerId}/${id}.woff2`,
        status: "ready",
        meta: { family: "Noto Sans", missingGlyphs: "" },
      },
    });
    return id;
  }

  function request(assetId: string) {
    return DELETE(new Request(`http://localhost/api/fonts/${assetId}`, { method: "DELETE" }), {
      params: Promise.resolve({ assetId }),
    });
  }

  it("deletes the caller's own font, object first then row", async () => {
    const assetId = await createFontAsset(userId);

    const response = await request(assetId);

    expect(response.status).toBe(200);
    expect(deleteObjectMock).toHaveBeenCalledWith(`u/${userId}/${assetId}.woff2`);
    expect(await prisma.mediaAsset.findUnique({ where: { id: assetId } })).toBeNull();
  });

  it("returns 404 — not 403 — for someone else's font, and leaves it alone", async () => {
    const assetId = await createFontAsset(otherUserId);

    const response = await request(assetId);

    expect(response.status).toBe(404);
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(await prisma.mediaAsset.findUnique({ where: { id: assetId } })).not.toBeNull();
  });

  it("returns an identical 404 for a font that does not exist, so ids cannot be probed", async () => {
    const missing = await request(randomUUID());
    const notMine = await request(await createFontAsset(otherUserId));

    expect(missing.status).toBe(404);
    expect(notMine.status).toBe(404);
    expect(await missing.json()).toEqual(await notMine.json());
  });

  it("refuses to delete an asset of another kind through this route", async () => {
    // `/api/fonts/[id]` must not become a general-purpose asset deleter: an
    // image id passed here would otherwise remove a photo from a published
    // album.
    const id = randomUUID();
    await prisma.mediaAsset.create({
      data: { id, userId, kind: "image", url: "https://cdn.test/x.webp", status: "ready", meta: {} },
    });

    const response = await request(id);

    expect(response.status).toBe(404);
    expect(await prisma.mediaAsset.findUnique({ where: { id } })).not.toBeNull();
  });

  it("rejects an anonymous delete", async () => {
    authMock.mockResolvedValue(null);
    const assetId = await createFontAsset(userId);

    const response = await request(assetId);

    expect(response.status).toBe(401);
    expect(await prisma.mediaAsset.findUnique({ where: { id: assetId } })).not.toBeNull();
  });
});
