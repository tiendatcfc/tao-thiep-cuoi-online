import Image from "next/image";
import Link from "next/link";
import { UseTemplateButton } from "./UseTemplateButton";

export type GalleryTier = "basic" | "premium";

export interface GalleryTemplate {
  id: string;
  name: string;
  tier: GalleryTier;
  thumbnailUrl: string;
}

export interface TemplateGalleryProps {
  templates: GalleryTemplate[];
  tier: GalleryTier;
  isAuthenticated: boolean;
}

const TIER_LABEL: Record<GalleryTier, string> = { basic: "Basic", premium: "Premium" };

/**
 * The `/mau-thiep` gallery grid, factored out of `page.tsx` (a server
 * component that fetches from Prisma) so this purely presentational half
 * can be rendered directly in a test without a database. Browsing is
 * public — `isAuthenticated` only changes what the "Dùng mẫu này" action
 * does (create-and-edit vs. send to sign-in), never what's visible.
 */
export function TemplateGallery({ templates, tier, isAuthenticated }: TemplateGalleryProps) {
  return (
    <div>
      <nav className="flex gap-2" aria-label="Lọc theo hạng mẫu">
        {(["basic", "premium"] as const).map((t) => (
          <Link
            key={t}
            href={`/mau-thiep?tier=${t}`}
            aria-current={tier === t ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tier === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {TIER_LABEL[t]}
          </Link>
        ))}
      </nav>

      {tier === "premium" ? (
        <p className="mt-12 text-center text-sm text-gray-400">Mẫu Premium sắp ra mắt</p>
      ) : templates.length === 0 ? (
        <p className="mt-12 text-center text-sm text-gray-400">Chưa có mẫu thiệp nào.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              data-testid="template-card"
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[2/3] w-full bg-gray-100">
                <Image
                  src={template.thumbnailUrl}
                  alt={template.name}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {TIER_LABEL[template.tier]}
                  </span>
                </div>
                <div className="mt-4">
                  {isAuthenticated ? (
                    <UseTemplateButton templateId={template.id} />
                  ) : (
                    <Link
                      href={`/dang-nhap?next=${encodeURIComponent("/mau-thiep")}`}
                      className="block w-full rounded-lg bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                      Dùng mẫu này
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
