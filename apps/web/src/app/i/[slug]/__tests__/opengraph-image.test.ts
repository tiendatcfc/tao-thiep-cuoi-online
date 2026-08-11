import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import Image, { contentType, size } from "../opengraph-image";

// The smallest possible valid PNG (1x1, transparent) — used as the mock
// fetch response body for the "cover image fetch succeeds" tests below, so
// satori genuinely decodes a real image rather than a name for one.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let userId: string;
const createdInvitationIds: string[] = [];

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `og-image-${randomUUID()}@test.local`, name: "OG Image Test User" },
  });
  return user.id;
}

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG's IHDR chunk (always first) stores width/height as big-endian uint32s at fixed offsets. */
function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function createPublishedInvitationWithCover(coverImage: string): Promise<string> {
  const document = createDefaultDocument();
  const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
  if (!cover) throw new Error("default document has no cover section");
  cover.props.groomName = "Minh";
  cover.props.brideName = "Lan";
  cover.props.coverImage = coverImage;

  const slug = `og-${randomUUID()}`;
  const invitation = await prisma.invitation.create({
    data: { slug, userId, document, publishedDocument: document, status: "published", publishedAt: new Date() },
  });
  createdInvitationIds.push(invitation.id);
  return slug;
}

describe("opengraph-image route (app/i/[slug]/opengraph-image.tsx)", () => {
  it("exports the documented 1200x630 png size/content-type constants", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
  });

  it("returns a real, non-trivial PNG for a published invitation with Vietnamese names", async () => {
    userId = await createUser();
    const slug = `og-${randomUUID()}`;
    const document = createDefaultDocument();
    const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
    if (!cover) throw new Error("default document has no cover section");
    cover.props.groomName = "Đặng Minh Khang";
    cover.props.brideName = "Nguyễn Thị Thu Hà";
    cover.props.date = "2026-12-20T09:00:00+07:00";

    const invitation = await prisma.invitation.create({
      data: {
        slug,
        userId,
        document,
        publishedDocument: document,
        status: "published",
        publishedAt: new Date(),
      },
    });
    createdInvitationIds.push(invitation.id);

    const response = await Image({ params: Promise.resolve({ slug }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(buffer.byteLength).toBeGreaterThan(5000);
    expect(readPngDimensions(buffer)).toEqual({ width: 1200, height: 630 });
  });

  it("still returns a valid PNG (never throws) for a non-existent slug", async () => {
    const response = await Image({ params: Promise.resolve({ slug: `no-such-${randomUUID()}` }) });
    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("still returns a valid PNG (never throws) for a draft (unpublished) invitation", async () => {
    userId = await createUser();
    const slug = `og-draft-${randomUUID()}`;
    const invitation = await prisma.invitation.create({
      data: { slug, userId, document: createDefaultDocument(), status: "draft" },
    });
    createdInvitationIds.push(invitation.id);

    const response = await Image({ params: Promise.resolve({ slug }) });
    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("still returns a valid PNG (never throws) for a malformed publishedDocument", async () => {
    userId = await createUser();
    const slug = `og-malformed-${randomUUID()}`;
    const invitation = await prisma.invitation.create({
      data: {
        slug,
        userId,
        document: createDefaultDocument(),
        publishedDocument: { not: "a valid document" } as never,
        status: "published",
        publishedAt: new Date(),
      },
    });
    createdInvitationIds.push(invitation.id);

    const response = await Image({ params: Promise.resolve({ slug }) });
    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("still returns a valid PNG when the cover image URL is unfetchable (falls back to a solid background)", async () => {
    userId = await createUser();
    const slug = `og-badimg-${randomUUID()}`;
    const document = createDefaultDocument();
    const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
    if (!cover) throw new Error("default document has no cover section");
    // Looks like an absolute URL but resolves nowhere — exercises the
    // fetch-failure fallback path rather than the "not an absolute URL"
    // skip path.
    cover.props.coverImage = "https://invalid.invalid.example/does-not-exist.jpg";

    const invitation = await prisma.invitation.create({
      data: {
        slug,
        userId,
        document,
        publishedDocument: document,
        status: "published",
        publishedAt: new Date(),
      },
    });
    createdInvitationIds.push(invitation.id);

    const response = await Image({ params: Promise.resolve({ slug }) });
    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  // Coordinator review fix: the cover image used to be fetched twice (once
  // to probe reachability, once by satori itself rendering `<img src>`) —
  // a TOCTOU gap where the URL could stop responding between the two. It's
  // now fetched exactly once and handed to satori as an already-decoded
  // `data:` URI.
  describe("single-fetch cover image (coordinator review fix)", () => {
    it("fetches the cover image exactly once and renders the photo variant when the fetch succeeds", async () => {
      userId = await createUser();
      const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } }));

      try {
        const slug = await createPublishedInvitationWithCover("https://photos.example.com/cover.png");

        const response = await Image({ params: Promise.resolve({ slug }) });
        expect(response.status).toBe(200);
        // `ImageResponse` defers all actual rendering into a lazily-read
        // `ReadableStream` (see opengraph-image.tsx's own comment on this) —
        // satori wouldn't attempt its own `<img src>` fetch (if this route
        // still had the old double-fetch bug) until the body is actually
        // consumed, so the call-count assertion MUST come after
        // `.arrayBuffer()`, not before, or it would pass even with a
        // reintroduced double-fetch. (Verified by reverting this route to
        // the old design and confirming this exact test catches it — see
        // the Task 17 report's fix-round section.)
        const buffer = Buffer.from(await response.arrayBuffer());
        expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("falls back to the no-photo variant, still fetching exactly once, when the cover image fetch returns a non-OK response", async () => {
      userId = await createUser();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

      try {
        const slug = await createPublishedInvitationWithCover("https://photos.example.com/missing.png");

        const response = await Image({ params: Promise.resolve({ slug }) });
        expect(response.status).toBe(200);
        const buffer = Buffer.from(await response.arrayBuffer());
        expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("skips the photo variant when the fetched image exceeds the size guard, producing byte-identical output to no cover image at all", async () => {
      userId = await createUser();
      const oversized = Buffer.alloc(5 * 1024 * 1024, 1); // 5MB, over the ~4MB guard
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(oversized, { status: 200, headers: { "content-type": "image/jpeg" } }));

      try {
        const slugWithOversizedImage = await createPublishedInvitationWithCover(
          "https://photos.example.com/huge.jpg",
        );
        const oversizedResponse = await Image({ params: Promise.resolve({ slug: slugWithOversizedImage }) });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const oversizedBuffer = Buffer.from(await oversizedResponse.arrayBuffer());

        fetchSpy.mockRestore(); // the no-image comparison run below must not fetch at all

        const slugWithNoImage = await createPublishedInvitationWithCover("");
        const noImageResponse = await Image({ params: Promise.resolve({ slug: slugWithNoImage }) });
        const noImageBuffer = Buffer.from(await noImageResponse.arrayBuffer());

        expect(oversizedBuffer.equals(noImageBuffer)).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
