import type { Metadata } from "next";
import { prisma } from "@hpwd/db";
import { LandingPage } from "./LandingPage";

const TITLE = "HPWD — Tạo thiệp cưới online miễn phí, không watermark";
const DESCRIPTION =
  "Thiết kế thiệp cưới online theo từng mục: bìa, cô dâu chú rể, sự kiện, album ảnh, hộp mừng QR ngân hàng, sổ lời chúc, RSVP. Miễn phí, không watermark, xuất bản trong vài phút.";

/**
 * Static — nothing here depends on the request, unlike `app/i/[slug]`'s
 * per-invitation `generateMetadata`. Still exported as a function (rather
 * than a plain `metadata` object) to match that page's shape and stay
 * trivially unit-testable by calling it directly.
 */
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: "/",
      type: "website",
      locale: "vi_VN",
    },
  };
}

/**
 * The public marketing landing page, `/`. Fetches the same live Basic
 * templates `/mau-thiep` shows (Task 18) so the gallery strip here never
 * drifts out of sync with what a couple actually sees after clicking
 * through. `LandingPage` (the presentational half) renders its own "Chưa có
 * mẫu thiệp nào." empty state if this comes back empty.
 */
export default async function HomePage() {
  const templates = await prisma.template.findMany({
    where: { isActive: true, tier: "basic" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, thumbnailUrl: true },
  });

  return <LandingPage templates={templates} />;
}
