import { auth } from "@/auth";
import { listActiveTemplates } from "@/lib/templates";
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
 * Both tiers query the database. This used to short-circuit the Premium
 * tier to an empty array — a deliberate YAGNI shortcut from Task 18, when
 * no Premium template existed — which silently survived Phase 3 seeding
 * ten of them: the tab stayed empty and nothing failed, because the only
 * tested half was the presentational component that renders whatever list
 * it is handed. The query now lives in `lib/templates.ts`, where a test
 * covers it against the real database.
 */
export default async function TemplateGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tier = parseTier(params.tier);

  const [session, templates] = await Promise.all([auth(), listActiveTemplates(tier)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Chọn mẫu thiệp</h1>
      <p className="mt-1 text-sm text-gray-500">
        Chọn một mẫu để bắt đầu — bạn có thể tuỳ chỉnh mọi nội dung sau khi tạo thiệp.
      </p>

      <div className="mt-6">
        <TemplateGallery
          templates={templates}
          tier={tier}
          isAuthenticated={Boolean(session?.user?.id)}
        />
      </div>
    </div>
  );
}
