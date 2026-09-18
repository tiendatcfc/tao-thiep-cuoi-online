import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "bullmq";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { backgroundRemovalOutputKey, processBgRemovalJob } from "../background-removal-worker";
import type { BgRemovalJobData } from "../queues";
import { uploadFile } from "../storage";

/**
 * Real Postgres, real MinIO, and a real HTTP server standing in for
 * `services/rembg`.
 *
 * The stand-in is deliberate and is not a mock of the module under test: it
 * is a genuine socket, so the request this worker actually builds (multipart
 * field name, method, path) has to be right for anything to pass, and the
 * failure cases — a 400, a 500, a hang — are ones a mocked `fetch` could
 * only pretend to have. What the Python service does with those bytes is
 * covered by `services/rembg/test_main.py`, against the real model.
 */

let userId: string;
let workDir: string;
let server: Server;
let serviceUrl: string;
const createdAssetIds: string[] = [];

/** What the fake service does with the next request. Reassigned per test. */
let handler: (body: Buffer) => { status: number; body: Buffer | string; contentType?: string } | "hang";
let lastRequest: { method: string; url: string; body: Buffer } | null = null;

/** A one-pixel transparent PNG — enough to prove bytes came back and were stored verbatim. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Builds a fake BullMQ job. Only the fields the processor reads are
 * provided; a real `Job` would need a live queue and add nothing, since the
 * queue round trip has its own test.
 */
function fakeJob(data: BgRemovalJobData, attemptsMade = 0, attempts = 3): Job<BgRemovalJobData> {
  return { data, attemptsMade, opts: { attempts } } as unknown as Job<BgRemovalJobData>;
}

async function seedSourceObject(): Promise<string> {
  const key = `test/${randomUUID()}-source.png`;
  const path = join(workDir, "source.png");
  await writeFile(path, PNG_BYTES);
  await uploadFile(key, path, "image/png");
  return key;
}

async function createTargetAsset(): Promise<string> {
  const id = randomUUID();
  await prisma.mediaAsset.create({
    data: { id, userId, kind: "image", url: "", status: "processing", meta: { sourceAssetId: "src" } },
  });
  createdAssetIds.push(id);
  return id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `nobg-worker-${randomUUID()}@test.local`, name: "Background Removal Worker Test" },
  });
  userId = user.id;
  workDir = await mkdtemp(join(tmpdir(), "hpwd-nobg-test-"));

  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      lastRequest = { method: request.method ?? "", url: request.url ?? "", body };
      const outcome = handler(body);
      if (outcome === "hang") return; // never responds, on purpose
      response.writeHead(outcome.status, { "content-type": outcome.contentType ?? "image/png" });
      response.end(outcome.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");
  serviceUrl = `http://127.0.0.1:${address.port}`;
  process.env.REMBG_URL = serviceUrl;
});

afterEach(() => {
  lastRequest = null;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.mediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await rm(workDir, { recursive: true, force: true });
});

describe("processBgRemovalJob", () => {
  it("uploads the returned PNG and marks the target asset ready", async () => {
    handler = () => ({ status: 200, body: PNG_BYTES });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await processBgRemovalJob(
      fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }),
    );

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.status).toBe("ready");
    expect(asset.url).toContain(backgroundRemovalOutputKey(userId, targetAssetId));

    // Fetched without credentials: the cut-out has to be publicly readable
    // or the invitation cannot display it.
    const stored = await fetch(asset.url);
    expect(stored.status).toBe(200);
    expect(Buffer.from(await stored.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it("POSTs the source bytes as multipart, never a URL for the service to fetch", async () => {
    // Handing the service a URL would make it an SSRF primitive reachable
    // from the public upload flow. The bytes have to be in the body.
    handler = () => ({ status: 200, body: PNG_BYTES });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await processBgRemovalJob(fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }));

    expect(lastRequest?.method).toBe("POST");
    expect(lastRequest?.url).toBe("/remove-background");
    expect(lastRequest?.body.includes(PNG_BYTES)).toBe(true);
    expect(lastRequest?.body.toString("latin1")).toContain('name="file"');
    expect(lastRequest?.body.toString("latin1")).not.toContain(sourceKey);
  });

  it("writes the cut-out to its own key, leaving the source object untouched", async () => {
    handler = () => ({ status: 200, body: PNG_BYTES });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await processBgRemovalJob(fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }));

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.url).not.toContain(sourceKey);
    // And the original is still downloadable — "xoá nền" must be undoable.
    const sourceUrl = `${process.env.R2_PUBLIC_URL}/${sourceKey}`;
    expect((await fetch(sourceUrl)).status).toBe(200);
  });

  it("keeps the meta the route wrote instead of replacing the column", async () => {
    // A Prisma Json update REPLACES the value, so writing `{ contentType }`
    // wholesale would erase `sourceAssetId` and with it any way to tell
    // which photo a cut-out came from.
    handler = () => ({ status: 200, body: PNG_BYTES });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await processBgRemovalJob(fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }));

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.meta).toMatchObject({ sourceAssetId: "src", contentType: "image/png", error: null });
  });

  it("carries the service's own message into meta.error on the final attempt", async () => {
    handler = () => ({ status: 400, body: '{"detail":"not a decodable image"}', contentType: "application/json" });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await expect(
      processBgRemovalJob(fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }, 2, 3)),
    ).rejects.toThrow(/400/);

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.status).toBe("failed");
    expect(String((asset.meta as { error?: string }).error)).toContain("not a decodable image");
  });

  it("leaves the asset processing on a non-final attempt, so a retry can still succeed", async () => {
    // The editor stops polling the moment it sees "failed". Marking it on
    // attempt 1 would show a permanent error for a job about to be retried,
    // and the couple would never see it turn ready.
    handler = () => ({ status: 500, body: "boom", contentType: "text/plain" });
    const sourceKey = await seedSourceObject();
    const targetAssetId = await createTargetAsset();

    await expect(
      processBgRemovalJob(fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey }, 0, 3)),
    ).rejects.toThrow();

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.status).toBe("processing");
  });

  it("fails loudly when the source object does not exist", async () => {
    handler = () => ({ status: 200, body: PNG_BYTES });
    const targetAssetId = await createTargetAsset();

    await expect(
      processBgRemovalJob(
        fakeJob({ sourceAssetId: "src", targetAssetId, userId, sourceKey: "test/does-not-exist.png" }, 2, 3),
      ),
    ).rejects.toThrow();

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: targetAssetId } });
    expect(asset.status).toBe("failed");
  });
});
