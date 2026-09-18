import { prisma } from "@hpwd/db";

export type TemplateTier = "basic" | "premium";

export interface GalleryTemplateRow {
  id: string;
  name: string;
  tier: TemplateTier;
  thumbnailUrl: string;
}

/**
 * Active templates of one tier, for the `/mau-thiep` gallery.
 *
 * Extracted from the page so it can be tested against the real database:
 * the gallery page used to hard-code `tier === "basic" ? query : []` — a
 * deliberate YAGNI shortcut from Task 18, when no Premium template
 * existed. Phase 3 seeded ten of them and the tab stayed empty, with no
 * test anywhere that could have noticed, because the only tested half was
 * the presentational component that receives whatever list it is handed.
 */
export async function listActiveTemplates(tier: TemplateTier): Promise<GalleryTemplateRow[]> {
  const templates = await prisma.template.findMany({
    where: { isActive: true, tier },
    orderBy: { name: "asc" },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    tier: template.tier as TemplateTier,
    thumbnailUrl: template.thumbnailUrl,
  }));
}
