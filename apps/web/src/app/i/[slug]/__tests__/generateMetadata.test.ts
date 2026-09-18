import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterEach, describe, expect, it } from "vitest";
import { generateMetadata } from "../page";

let userId: string;
const createdInvitationIds: string[] = [];

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `og-meta-${randomUUID()}@test.local`, name: "OG Meta Test User" },
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

describe("generateMetadata (app/i/[slug]/page.tsx)", () => {
  it("returns empty metadata for a slug that doesn't exist", async () => {
    const result = await generateMetadata({ params: Promise.resolve({ slug: `no-such-${randomUUID()}` }) });
    expect(result).toEqual({});
  });

  it("returns empty metadata for a draft (unpublished) invitation", async () => {
    userId = await createUser();
    const slug = `draft-${randomUUID()}`;
    const invitation = await prisma.invitation.create({
      data: { slug, userId, document: createDefaultDocument(), status: "draft" },
    });
    createdInvitationIds.push(invitation.id);

    const result = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(result).toEqual({});
  });

  it("returns title/description/openGraph shaped from the cover section for a published invitation", async () => {
    userId = await createUser();
    const slug = `published-${randomUUID()}`;
    const document = createDefaultDocument();
    const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
    if (!cover) throw new Error("default document has no cover section");
    cover.props.groomName = "Minh";
    cover.props.brideName = "Lan";
    cover.props.tagline = "Chúng tôi sắp cưới rồi!";

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

    const result = await generateMetadata({ params: Promise.resolve({ slug }) });

    expect(result.title).toBe("Minh & Lan — Thiệp cưới");
    expect(result.description).toBe("Chúng tôi sắp cưới rồi!");
    expect(result.openGraph).toMatchObject({
      title: "Minh & Lan — Thiệp cưới",
      description: "Chúng tôi sắp cưới rồi!",
      url: `/i/${slug}`,
      type: "website",
      locale: "vi_VN",
    });
  });

  // The invitation carries guests' names (via `?g=`), the venue and home
  // addresses, phone numbers and, with a gift section, bank details.
  // `openGraph` is asserted in the SAME test on purpose: link previews are
  // the entire distribution channel for a wedding invitation, and the
  // scrapers behind them ignore the robots directive, so the two must be
  // shown to coexist rather than trusted to.
  it("tells search engines not to index a published invitation, without touching its link preview", async () => {
    userId = await createUser();
    const slug = `noindex-${randomUUID()}`;
    const document = createDefaultDocument();
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

    const result = await generateMetadata({ params: Promise.resolve({ slug }) });

    expect(result.robots).toEqual({ index: false, follow: false });
    expect(result.openGraph).toMatchObject({ url: `/i/${slug}`, type: "website" });
  });

  it("falls back to the default tagline when the cover has none", async () => {
    userId = await createUser();
    const slug = `no-tagline-${randomUUID()}`;
    const document = createDefaultDocument();
    const cover = document.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
    if (!cover) throw new Error("default document has no cover section");
    cover.props.tagline = "";

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

    const result = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(result.description).toBe("Trân trọng kính mời bạn đến dự lễ cưới của chúng tôi.");
  });

  it("does not throw and returns empty metadata for a malformed publishedDocument", async () => {
    userId = await createUser();
    const slug = `malformed-${randomUUID()}`;
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

    await expect(generateMetadata({ params: Promise.resolve({ slug }) })).resolves.toEqual({});
  });
});
