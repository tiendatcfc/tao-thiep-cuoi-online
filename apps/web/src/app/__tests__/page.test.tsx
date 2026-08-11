import { prisma } from "@hpwd/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage, { dynamic } from "../page";

/**
 * B3: `/` used to be statically prerendered, running
 * `prisma.template.findMany()` at BUILD time — against a fresh database
 * with no migrations applied (exactly what CI's Build step does today), the
 * `Template` table doesn't exist yet and that throw failed the whole
 * `next build`. `dynamic = "force-dynamic"` moves the query to request
 * time; this also degrades to the empty-state `LandingPage` already
 * renders on ANY query failure, so a DB blip (or, in production, a
 * migration that hasn't landed yet) never breaks the homepage.
 */
describe("app/page.tsx (B3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opts out of static prerendering", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("passes live templates through to LandingPage on a successful query", async () => {
    const fixture = [{ id: "t1", name: "Mẫu 1", thumbnailUrl: "https://cdn.test/t1.png" }];
    vi.spyOn(prisma.template, "findMany").mockResolvedValueOnce(fixture);

    const element = await HomePage();

    expect(element.props.templates).toEqual(fixture);
  });

  it("degrades to an empty template list (LandingPage's own empty state) instead of throwing when the query fails", async () => {
    vi.spyOn(prisma.template, "findMany").mockRejectedValueOnce(
      new Error('The table "public"."Template" does not exist in the current database.'),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const element = await HomePage();

    expect(element.props.templates).toEqual([]);
    errorSpy.mockRestore();
  });
});
