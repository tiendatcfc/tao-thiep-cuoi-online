import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `auth()` is mocked because there is no browser session when a route
// handler is called directly. `putObject` and `enqueueAudioJob` are mocked
// so these cases can drive the route's own branches (including the failure
// ones, which are impossible to trigger reliably against live MinIO/Redis);
// the real storage + queue path is covered by the mandatory end-to-end run
// in the task, not by mocks pretending to be it.
const { authMock, putObjectMock, enqueueAudioJobMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  putObjectMock: vi.fn(),
  enqueueAudioJobMock: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, putObject: putObjectMock };
});
vi.mock("@/lib/queues", () => ({ enqueueAudioJob: enqueueAudioJobMock }));

import { MAX_AUDIO_SIZE_BYTES } from "@/lib/audio";

import { POST } from "../uploads/audio/route";

let userId: string;

function makeFile(name: string, type: string, byteLength: number): File {
  return new File([new Uint8Array(byteLength)], name, { type });
}

/**
 * A `Request` built in-process never carries `content-length` for a FormData
 * body (it is a network-layer header added at send time), but the route's
 * pre-check requires one — so the body is encoded once to learn its real
 * length and the request rebuilt with that header, exactly as
 * `uploads.test.ts` does for the image route.
 */
async function multipartRequest(file: File | null, overrideLength?: string): Promise<Request> {
  const form = new FormData();
  if (file) form.append("file", file);
  const probe = new Request("http://localhost/api/uploads/audio", { method: "POST", body: form });
  const contentType = probe.headers.get("content-type")!;
  const bytes = await probe.arrayBuffer();
  const headers: Record<string, string> = { "content-type": contentType };
  if (overrideLength !== undefined) {
    if (overrideLength !== "") headers["content-length"] = overrideLength;
  } else {
    headers["content-length"] = String(bytes.byteLength);
  }
  return new Request("http://localhost/api/uploads/audio", { method: "POST", headers, body: bytes });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `audio-upload-${randomUUID()}@test.local`, name: "Audio Upload Test" },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: userId } });
  putObjectMock.mockReset().mockResolvedValue("http://localhost:9000/hpwd/u/x/y-source.mp3");
  enqueueAudioJobMock.mockReset().mockResolvedValue("job-1");
});

afterEach(async () => {
  await prisma.mediaAsset.deleteMany({ where: { userId } });
});

describe("POST /api/uploads/audio", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(await multipartRequest(makeFile("a.mp3", "audio/mpeg", 10)));

    expect(res.status).toBe(401);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects a body with no usable content-length before parsing it", async () => {
    // Mirrors the image route: `request.formData()` buffers the WHOLE body
    // into memory before any size can be read, so a client sending no
    // length (or a chunked body) could otherwise push 15MB+ into RAM first.
    const res = await POST(await multipartRequest(makeFile("a.mp3", "audio/mpeg", 10), ""));

    expect(res.status).toBe(400);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared content-length without parsing the body", async () => {
    const res = await POST(
      await multipartRequest(makeFile("a.mp3", "audio/mpeg", 10), String(MAX_AUDIO_SIZE_BYTES + 2 * 1024 * 1024)),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/15\s*MB/i);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects a content type outside the allowlist with a Vietnamese message", async () => {
    const res = await POST(await multipartRequest(makeFile("song.wav", "audio/wav", 100)));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/MP3|M4A/i);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects a file whose real size exceeds the cap even when the declared length slipped through", async () => {
    const tooBig = makeFile("big.mp3", "audio/mpeg", MAX_AUDIO_SIZE_BYTES + 1);

    const res = await POST(await multipartRequest(tooBig));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/15\s*MB/i);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("stores the source, records an audio MediaAsset and queues the transcode", async () => {
    const res = await POST(await multipartRequest(makeFile("bai-hat.mp3", "audio/mpeg", 2048)));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assetId).toBeTruthy();
    expect(body.status).toBe("processing");

    const asset = await prisma.mediaAsset.findUnique({ where: { id: body.assetId } });
    expect(asset?.kind).toBe("audio");
    expect(asset?.userId).toBe(userId);
    expect(asset?.status).toBe("processing");

    // The worker is told where to read the source from; a key it cannot
    // resolve would fail every job with no way to tell why.
    const meta = asset?.meta as Record<string, unknown>;
    expect(typeof meta.sourceKey).toBe("string");
    expect(enqueueAudioJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: body.assetId, userId, sourceKey: meta.sourceKey }),
    );
  });

  it("uses the declared content type to pick the stored extension", async () => {
    await POST(await multipartRequest(makeFile("track.m4a", "audio/x-m4a", 512)));

    expect(putObjectMock).toHaveBeenCalledWith(
      expect.stringMatching(/\.m4a$/),
      expect.anything(),
      "audio/x-m4a",
    );
  });

  it("writes the object BEFORE the database row, so no row can point at a missing file", async () => {
    putObjectMock.mockRejectedValue(new Error("storage down"));

    const res = await POST(await multipartRequest(makeFile("a.mp3", "audio/mpeg", 128)));

    expect(res.status).toBe(500);
    expect(await prisma.mediaAsset.count({ where: { userId } })).toBe(0);
  });

  it("marks the asset failed and answers 503 when the job cannot be queued", async () => {
    // Deliberately NOT fail-open: a swallowed enqueue error would leave the
    // couple watching an upload that no worker will ever process.
    enqueueAudioJobMock.mockRejectedValue(new Error("redis down"));

    const res = await POST(await multipartRequest(makeFile("a.mp3", "audio/mpeg", 128)));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/thử lại/i);
    const assets = await prisma.mediaAsset.findMany({ where: { userId } });
    expect(assets).toHaveLength(1);
    expect(assets[0].status).toBe("failed");
  });
});
