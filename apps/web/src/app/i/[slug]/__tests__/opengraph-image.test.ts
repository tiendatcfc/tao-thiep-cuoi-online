import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import Image, { contentType, formatVietnameseDate, size } from "../opengraph-image";

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

  // B5: see `lib/__tests__/date.test.ts` for the general rationale. Without
  // an explicit `timeZone`, this OG-image date would be permanently wrong
  // (one day off) whenever the rendering server's local timezone isn't
  // `Asia/Ho_Chi_Minh` — this is the "shop-window" share image on
  // Zalo/Facebook, so a wrong date there is highly visible.
  describe("formatVietnameseDate (B5 timezone consistency)", () => {
    const MIDNIGHT_STRADDLING_INSTANT = "2026-12-19T18:30:00Z";
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("renders the same (Vietnamese) calendar day under both TZ=UTC and TZ=Asia/Ho_Chi_Minh", () => {
      process.env.TZ = "UTC";
      const underUtc = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);
      process.env.TZ = "Asia/Ho_Chi_Minh";
      const underIct = formatVietnameseDate(MIDNIGHT_STRADDLING_INSTANT);

      expect(underUtc).toBe(underIct);
      expect(underUtc).toBe("20/12/2026");
    });
  });

  it("returns a real, non-trivial PNG for a published invitation with Vietnamese names", async () => {
    userId = await createUser();
    const slug = `og-${randomUUID()}`;
    const document = createDefaultDocument();
    const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
    if (!cover) throw new Error("default document has no cover section");
    cover.props.groomName = "Nguyễn Ngọc Hải";
    cover.props.brideName = "Sen Thị Hồng Thắm";
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
    // Must be a host `isAllowedImageUrl` accepts (see the B4 describe block
    // below) — `.env.local`/CI both set `R2_PUBLIC_URL=http://localhost:9000/hpwd`,
    // so this is the real allowlisted host, not an arbitrary external one.
    const ALLOWED_COVER_HOST = "http://localhost:9000/hpwd";

    it("fetches the cover image exactly once and renders the photo variant when the fetch succeeds", async () => {
      userId = await createUser();
      const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } }));

      try {
        const slug = await createPublishedInvitationWithCover(`${ALLOWED_COVER_HOST}/cover.png`);

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
        // B4: redirects from an allowlisted host must not be auto-followed.
        expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("falls back to the no-photo variant, still fetching exactly once, when the cover image fetch returns a non-OK response", async () => {
      userId = await createUser();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

      try {
        const slug = await createPublishedInvitationWithCover(`${ALLOWED_COVER_HOST}/missing.png`);

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
        const slugWithOversizedImage = await createPublishedInvitationWithCover(`${ALLOWED_COVER_HOST}/huge.jpg`);
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

    it("skips downloading the body at all when content-length is honestly declared oversized, even though the real body is tiny", async () => {
      userId = await createUser();
      // A real body far under the guard, but a `content-length` header that
      // (honestly, per the server) declares it oversized — this only fails
      // closed if the fast-path check actually reads the header; a version
      // of the code that only checked the real downloaded byte count would
      // wrongly let this tiny body through as a valid cover image.
      const tinyBody = Buffer.from("tiny");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(tinyBody, {
          status: 200,
          headers: { "content-type": "image/jpeg", "content-length": String(5 * 1024 * 1024) },
        }),
      );

      try {
        const slugWithDeclaredOversized = await createPublishedInvitationWithCover(
          `${ALLOWED_COVER_HOST}/declared-huge.jpg`,
        );
        const declaredOversizedResponse = await Image({
          params: Promise.resolve({ slug: slugWithDeclaredOversized }),
        });
        const declaredOversizedBuffer = Buffer.from(await declaredOversizedResponse.arrayBuffer());

        fetchSpy.mockRestore(); // the no-image comparison run below must not fetch at all

        const slugWithNoImage = await createPublishedInvitationWithCover("");
        const noImageResponse = await Image({ params: Promise.resolve({ slug: slugWithNoImage }) });
        const noImageBuffer = Buffer.from(await noImageResponse.arrayBuffer());

        expect(declaredOversizedBuffer.equals(noImageBuffer)).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  // B4: this route added a second server-side image fetcher without the
  // SSRF allowlist `next.config.ts` already established for
  // `/_next/image?url=` — a couple's `coverImage` is arbitrary user input
  // (the editor stores whatever URL an upload returns, or a hand-typed
  // one), so without this guard the production server would fetch
  // WHATEVER host is named there, on every request for that invitation's
  // OG image, including internal/link-local addresses.
  describe("SSRF guard: cover image host allowlist (B4)", () => {
    it("never fetches a cover image on a non-allowlisted (arbitrary external) host", async () => {
      userId = await createUser();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      try {
        const slug = await createPublishedInvitationWithCover("https://attacker.example.net/cover.png");

        const response = await Image({ params: Promise.resolve({ slug }) });
        expect(response.status).toBe(200);
        const buffer = Buffer.from(await response.arrayBuffer());
        expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
        // The real assertion: no network request to the untrusted host at
        // all — the allowlist rejects it before any `fetch` call, not after
        // an attempted-and-failed one.
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("never fetches a cover image pointed at a link-local/metadata-service address", async () => {
      userId = await createUser();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      try {
        const slug = await createPublishedInvitationWithCover("http://169.254.169.254/latest/meta-data/");

        const response = await Image({ params: Promise.resolve({ slug }) });
        expect(response.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("does not follow a redirect from an allowlisted host to an arbitrary target (fetch called with redirect: manual)", async () => {
      userId = await createUser();
      // A real `redirect: "manual"` fetch resolves with an opaque
      // `type: "opaqueredirect"` response (`ok: false`, `status: 0`) rather
      // than transparently following the redirect target — simulated here
      // since undici's own opaqueredirect response can't be constructed
      // directly from a plain 3xx `Response`.
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 0,
        type: "opaqueredirect",
        headers: new Headers(),
        body: null,
      } as Response);

      try {
        const slug = await createPublishedInvitationWithCover("http://localhost:9000/hpwd/redirecting.png");

        const response = await Image({ params: Promise.resolve({ slug }) });
        expect(response.status).toBe(200);
        const buffer = Buffer.from(await response.arrayBuffer());
        expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
