// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { createDefaultDocument } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `auth()` has no session when a server component is invoked directly; the
// database is real (docker `hpwd-postgres`), because the thing under test is
// which rows come back for a given `?trang=`.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import WishesModerationPage from "../page";
import { PAGE_SIZE } from "@/lib/pagination";

let userId: string;
let invitationId: string;
const TOTAL = PAGE_SIZE + 12;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `wishes-page-${randomUUID()}@test.local`, name: "Wishes Page User" },
  });
  userId = user.id;
  authMock.mockResolvedValue({ user: { id: userId } });

  const document = createDefaultDocument();
  const invitation = await prisma.invitation.create({
    data: { slug: `test-moderation-${randomUUID()}`, userId, document, status: "draft" },
  });
  invitationId = invitation.id;

  // Newest first is the page's order, so wish #0 is the oldest. Created with
  // explicit, distinct timestamps rather than relying on insertion speed —
  // two rows sharing a millisecond would make the ordering, and therefore
  // which page a wish lands on, undefined.
  await prisma.wish.createMany({
    data: Array.from({ length: TOTAL }, (_, i) => ({
      invitationId,
      guestName: `Khách ${i}`,
      message: `Lời chúc ${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
    })),
  });
});

afterAll(async () => {
  await prisma.invitation.deleteMany({ where: { id: invitationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function renderPage(trang?: string) {
  const ui = await WishesModerationPage({
    params: Promise.resolve({ id: invitationId }),
    searchParams: Promise.resolve(trang === undefined ? {} : { trang }),
  });
  return render(ui);
}

/**
 * This page renders one interactive row per wish and is the page a couple
 * opens ON the wedding day, when wishes arrive fastest and the list is
 * longest. Unpaginated it rendered every wish the invitation had ever
 * received, every time they checked for new ones.
 */
describe("wishes moderation pagination", () => {
  it("shows one page's worth, newest first, not the whole history", async () => {
    const { container } = await renderPage();

    expect(container.querySelectorAll("li")).toHaveLength(PAGE_SIZE);
    // Newest is the highest index, since each wish is a minute after the last.
    expect(screen.getByText(`Lời chúc ${TOTAL - 1}`)).toBeInTheDocument();
    expect(screen.queryByText("Lời chúc 0")).not.toBeInTheDocument();
  });

  it("puts the remainder on the last page", async () => {
    const { container } = await renderPage("2");

    expect(container.querySelectorAll("li")).toHaveLength(TOTAL - PAGE_SIZE);
    expect(screen.getByText("Lời chúc 0")).toBeInTheDocument();
  });

  it("tells the couple where they are in the list", async () => {
    await renderPage();
    expect(screen.getByText(`Đang hiện 1–${PAGE_SIZE} trong ${TOTAL} lời chúc (trang 1/2).`)).toBeInTheDocument();
  });

  // A couple who edits the URL, or follows a link from when there were more
  // wishes, must land on a page that exists rather than an empty list.
  it.each([["99"], ["0"], ["abc"], ["-1"]])("clamps ?trang=%s into range", async (trang) => {
    const { container } = await renderPage(trang);
    expect(container.querySelectorAll("li").length).toBeGreaterThan(0);
  });
});
