import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterEach, describe, expect, it } from "vitest";
import Image, { contentType, size } from "../opengraph-image";

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
});
