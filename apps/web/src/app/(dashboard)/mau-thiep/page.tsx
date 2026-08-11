import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { TemplateGallery, type GalleryTier } from "./TemplateGallery";

function parseTier(raw: string | string[] | undefined): GalleryTier {
  return raw === "premium" ? "premium" : "basic";
}

/**
 * The template gallery, `/mau-thiep` — deliberately public (not behind the
 * `/dashboard`/`/editor` auth middleware in `middleware.ts`) so a couple can
 * browse templates before signing in. Only the "Dùng mẫu này" action
 * requires an account: unauthenticated visitors get a sign-in link instead
 * of the create-and-edit button (see `TemplateGallery`).
 *
 * There are no Premium templates yet (YAGNI — out of scope for Task 18), so
 * that tier never queries the database; it always renders the "coming
 * soon" empty state.
 */
export default async function TemplateGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tier = parseTier(params.tier);

  const [session, templates] = await Promise.all([
    auth(),
    tier === "basic"
      ? prisma.template.findMany({
          where: { isActive: true, tier: "basic" },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Chọn mẫu thiệp</h1>
      <p className="mt-1 text-sm text-gray-500">
        Chọn một mẫu để bắt đầu — bạn có thể tuỳ chỉnh mọi nội dung sau khi tạo thiệp.
      </p>

      <div className="mt-6">
        <TemplateGallery
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            tier: t.tier,
            thumbnailUrl: t.thumbnailUrl,
          }))}
          tier={tier}
          isAuthenticated={Boolean(session?.user?.id)}
        />
      </div>
    </div>
  );
}
