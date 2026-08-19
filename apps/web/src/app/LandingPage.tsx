import Image from "next/image";
import Link from "next/link";

export interface LandingTemplate {
  id: string;
  name: string;
  thumbnailUrl: string;
}

export interface Feature {
  id: string;
  label: string;
  description: string;
  /** `false` renders a "Sắp có" badge — see the module doc for why this list must stay honest. */
  shipped: boolean;
}

/**
 * The feature grid backing the landing page's "tất cả những gì bạn cần"
 * section. Every `shipped: true` row corresponds to something a couple can
 * actually use today (verified against the section/editor components this
 * phase shipped); everything else is real Phase 2/3 roadmap, not vapourware
 * — marking it honestly as "Sắp có" (`shipped: false`) rather than omitting
 * it or, worse, claiming it works.
 *
 * Exported (not inlined in JSX) so `__tests__/LandingPage.test.tsx` can
 * assert the shipped/coming-soon split without re-deriving it by hand.
 */
export const FEATURES: Feature[] = [
  {
    id: "section-editor",
    label: "Trình thiết kế theo mục",
    description:
      "Xây thiệp từ các mục có sẵn: bìa, cô dâu chú rể, câu chuyện, sự kiện, album, mừng cưới, lời chúc, RSVP.",
    shipped: true,
  },
  {
    id: "no-watermark",
    label: "Không watermark",
    description: "Thiệp xuất bản không gắn logo hay watermark của HPWD.",
    shipped: true,
  },
  {
    id: "vietqr-gift",
    label: "Hộp mừng QR ngân hàng",
    description: "Khách quét mã VietQR để chuyển khoản mừng cưới, tự điền đúng ngân hàng và số tài khoản.",
    shipped: true,
  },
  {
    id: "opening-effects",
    label: "Hiệu ứng mở thiệp",
    description: "Chọn hiệu ứng mở phong bì, kéo rèm hoặc mờ dần khi khách mở thiệp.",
    shipped: true,
  },
  {
    id: "scroll-animations",
    label: "Hiệu ứng chuyển động khi cuộn",
    description: "Từng mục xuất hiện mượt mà khi khách cuộn trang, vẫn tôn trọng cài đặt giảm chuyển động.",
    shipped: true,
  },
  {
    id: "basic-templates",
    label: "Mẫu thiệp Basic",
    description: "5 mẫu thiết kế sẵn, đổi màu chủ đạo và font chữ theo ý muốn.",
    shipped: true,
  },
  {
    id: "music-library",
    label: "Thư viện nhạc",
    description: "Chọn nhạc nền có sẵn, tự phát ngay sau khi khách mở thiệp.",
    shipped: true,
  },
  {
    id: "album-lightbox",
    label: "Album ảnh + lightbox",
    description: "Đăng ảnh cưới theo lưới, xem toàn màn hình khi khách nhấn vào từng ảnh.",
    shipped: true,
  },
  {
    id: "wishes-moderation",
    label: "Sổ lời chúc có kiểm duyệt",
    description: "Khách gửi lời chúc, cô dâu chú rể duyệt trước khi hiển thị công khai.",
    shipped: true,
  },
  {
    id: "rsvp-form",
    label: "Form RSVP",
    description: "Thu thập xác nhận tham dự, số lượng khách đi cùng và lời nhắn ngay trên thiệp.",
    shipped: true,
  },
  {
    id: "theme-customization",
    label: "Tuỳ chỉnh giao diện",
    description: "Đổi màu chủ đạo, font chữ tiêu đề và nội dung riêng cho từng thiệp.",
    shipped: true,
  },
  {
    id: "publish-share-image",
    label: "Xuất bản với ảnh chia sẻ",
    description: "Thiệp có đường link riêng và ảnh preview đẹp khi chia sẻ qua Zalo, Messenger.",
    shipped: true,
  },
  {
    id: "guest-name-links",
    label: "Tên khách mời tự động",
    description: "Gửi link riêng cho từng khách, tự hiển thị đúng tên khi họ mở thiệp.",
    shipped: true,
  },
  {
    id: "custom-music-upload",
    label: "Upload nhạc riêng",
    description: "Tải lên bài nhạc của riêng bạn thay vì chỉ chọn từ thư viện có sẵn.",
    shipped: false,
  },
  {
    id: "youtube-embed",
    label: "Nhúng video YouTube",
    description: "Thêm video kỷ niệm hoặc video cưới ngay trong thiệp.",
    shipped: true,
  },
  {
    id: "text-hyperlinks",
    label: "Hyperlink trong văn bản",
    description: "Chèn liên kết vào các đoạn văn bản tự do trên thiệp.",
    shipped: false,
  },
  {
    id: "ai-background-removal",
    label: "AI xoá nền ảnh",
    description: "Tự động xoá nền ảnh cưới bằng AI, không cần công cụ chỉnh ảnh khác.",
    shipped: false,
  },
  {
    id: "custom-font-upload",
    label: "Font chữ tự tải lên",
    description: "Tải lên font chữ riêng để thiệp mang đúng phong cách của bạn.",
    shipped: false,
  },
  {
    id: "premium-templates",
    label: "Mẫu Premium",
    description: "Bộ sưu tập mẫu thiết kế cao cấp, phong cách đa dạng hơn.",
    shipped: false,
  },
];

const COMING_SOON_LABEL = "Sắp có";

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">{feature.label}</h3>
        {!feature.shipped ? (
          <span
            data-testid="coming-soon"
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          >
            {COMING_SOON_LABEL}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
    </div>
  );
}

export interface LandingPageProps {
  templates: LandingTemplate[];
}

/**
 * Pure presentational body of `/`, factored out of `page.tsx` (which fetches
 * `templates` from Prisma) the same way `TemplateGallery` is factored out of
 * `/mau-thiep`'s `page.tsx` — so this can be unit-tested with a fixture
 * template list, or an empty one, without a database.
 */
export function LandingPage({ templates }: LandingPageProps) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <span className="text-lg font-semibold tracking-tight text-gray-900">HPWD</span>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/mau-thiep" className="text-gray-600 hover:text-gray-900">
            Mẫu thiệp
          </Link>
          <Link href="/dang-nhap" className="text-gray-600 hover:text-gray-900">
            Đăng nhập
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">
            Thiệp cưới online
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Tạo thiệp cưới online đẹp, miễn phí và không watermark
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Thiết kế thiệp theo từng mục — album ảnh, sự kiện, hộp mừng QR ngân hàng, sổ lời chúc, RSVP —
            rồi xuất bản trong vài phút. Hoàn toàn miễn phí, không quảng cáo, không gắn logo HPWD lên thiệp
            của bạn.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/mau-thiep"
              className="w-full rounded-lg bg-gray-900 px-6 py-3 text-center text-base font-medium text-white transition hover:bg-gray-800 sm:w-auto"
            >
              Tạo thiệp miễn phí
            </Link>
            <Link
              href="/i/demo"
              className="w-full rounded-lg border border-gray-300 px-6 py-3 text-center text-base font-medium text-gray-900 transition hover:bg-gray-50 sm:w-auto"
            >
              Xem thiệp mẫu
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
            Tất cả những gì bạn cần cho một thiệp cưới online
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-500">
            Những mục đánh dấu &quot;{COMING_SOON_LABEL}&quot; đang được phát triển ở các giai đoạn tiếp
            theo — chưa dùng được trong thiệp của bạn hôm nay.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-semibold text-gray-900 sm:text-3xl">
            Xem mẫu thiệp có sẵn
          </h2>
          {/* text-gray-600, not -400: gray-400 on white is ~2.9:1, failing WCAG AA (4.5:1) for this text-sm text — flagged by Lighthouse's color-contrast audit. */}
          {templates.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-600">Chưa có mẫu thiệp nào.</p>
          ) : (
            <div className="mt-8 flex gap-4 overflow-x-auto pb-2">
              {templates.map((template) => (
                <Link
                  key={template.id}
                  href="/mau-thiep"
                  className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:w-48"
                >
                  <Image
                    src={template.thumbnailUrl}
                    alt={template.name}
                    fill
                    unoptimized
                    loading="lazy"
                    sizes="(max-width: 640px) 160px, 192px"
                    className="object-cover"
                  />
                </Link>
              ))}
            </div>
          )}
          <p className="mt-6 text-center">
            <Link href="/mau-thiep" className="text-sm font-medium text-gray-900 hover:underline">
              Xem tất cả mẫu thiệp →
            </Link>
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
            Sẵn sàng tạo thiệp cưới của riêng bạn?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-gray-600">
            Không cần thẻ thanh toán, không giới hạn thời gian dùng thử — vì HPWD miễn phí ngay từ đầu.
          </p>
          <Link
            href="/mau-thiep"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-8 py-3 text-base font-medium text-white transition hover:bg-gray-800"
          >
            Bắt đầu tạo thiệp ngay
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-gray-500 sm:flex-row">
          <p>© 2026 HPWD. Miễn phí cho mọi cặp đôi.</p>
          <nav className="flex gap-4">
            <Link href="/dieu-khoan" className="hover:text-gray-900 hover:underline">
              Điều khoản sử dụng
            </Link>
            <Link href="/bao-mat" className="hover:text-gray-900 hover:underline">
              Chính sách bảo mật
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
