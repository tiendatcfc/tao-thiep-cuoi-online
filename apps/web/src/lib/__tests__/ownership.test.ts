import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOwnedInvitation } from "../ownership";

let ownerId: string;
let otherId: string;
let invitationId: string;

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { email: `ownership-test-${randomUUID()}@test.local`, name: "Owner" },
  });
  ownerId = owner.id;
  const other = await prisma.user.create({
    data: { email: `ownership-test-other-${randomUUID()}@test.local`, name: "Other" },
  });
  otherId = other.id;
  const invitation = await prisma.invitation.create({
    data: { slug: `ownership-test-${randomUUID()}`, userId: ownerId, document: createDefaultDocument() },
  });
  invitationId = invitation.id;
});

afterAll(async () => {
  await prisma.invitation.delete({ where: { id: invitationId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  await prisma.user.delete({ where: { id: otherId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("findOwnedInvitation", () => {
  it("returns the invitation when the id exists and belongs to the given owner", async () => {
    const result = await findOwnedInvitation(invitationId, ownerId);
    expect(result?.id).toBe(invitationId);
  });

  it("returns null when the id doesn't exist", async () => {
    expect(await findOwnedInvitation(`no-such-id-${randomUUID()}`, ownerId)).toBeNull();
  });

  it("returns null when the id exists but belongs to a different user", async () => {
    expect(await findOwnedInvitation(invitationId, otherId)).toBeNull();
  });
});
