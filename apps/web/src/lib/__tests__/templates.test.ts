import { prisma } from "@hpwd/db";
import { describe, expect, it } from "vitest";
import { listActiveTemplates } from "../templates";

/**
 * Runs against the real dev Postgres, seeded by `pnpm seed:templates`.
 *
 * Mocking Prisma here would defeat the point: the bug this exists to catch
 * was a page that never issued the query at all, which any mock would have
 * happily reported as "no templates".
 */
describe("listActiveTemplates", () => {
  it("returns the five Basic templates", async () => {
    const templates = await listActiveTemplates("basic");

    expect(templates).toHaveLength(5);
    expect(templates.every((t) => t.tier === "basic")).toBe(true);
  });

  it("returns the ten Premium templates — the gallery tab used to be hard-coded empty", async () => {
    const templates = await listActiveTemplates("premium");

    expect(templates).toHaveLength(10);
    expect(templates.every((t) => t.tier === "premium")).toBe(true);
  });

  it("sorts by name, so the gallery order is stable between visits", async () => {
    const names = (await listActiveTemplates("premium")).map((t) => t.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("gives every template a thumbnail url", async () => {
    for (const tier of ["basic", "premium"] as const) {
      for (const template of await listActiveTemplates(tier)) {
        expect(template.thumbnailUrl, template.name).toMatch(/^https?:\/\//);
      }
    }
  });

  it("hides a deactivated template from the gallery", async () => {
    const [victim] = await listActiveTemplates("premium");
    await prisma.template.update({ where: { id: victim.id }, data: { isActive: false } });

    try {
      const visible = await listActiveTemplates("premium");
      expect(visible.map((t) => t.id)).not.toContain(victim.id);
      expect(visible).toHaveLength(9);
    } finally {
      await prisma.template.update({ where: { id: victim.id }, data: { isActive: true } });
    }
  });
});
