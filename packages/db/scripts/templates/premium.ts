import { createSection, type AlbumProps, type Section } from '@hpwd/schema'
import {
  buildOpening,
  buildStorySection,
  buildTemplate,
  buildTheme,
  findByType,
  type TemplateDefinition,
} from './builders'

/**
 * The 10 Premium-tier templates (spec feature 12: "10+ mẫu cầu kỳ — vẫn
 * miễn phí").
 *
 * "Premium" is a label for how elaborate a template is, never a paywall:
 * every feature of this product is free, and the `/mau-thiep` gallery has
 * had a Premium tab since Phase 1 that showed an empty list until now.
 *
 * What actually distinguishes them from the five Basic ones is the
 * machinery Phases 2 and 3 added — the `reveal`/`petals` openings, the
 * `hero` album layout, and the video, story and rich-text sections — not
 * just another colour scheme. The spec also mentions parallax; that has
 * never been defined as a feature here, so none of these fakes one.
 */

/** Returns the album section with a different layout, leaving everything else alone. */
function withAlbumLayout(album: Extract<Section, { type: 'album' }>, layout: AlbumProps['layout']) {
  return { ...album, props: { ...album.props, layout } }
}

/**
 * A rich-text section carrying real Vietnamese copy.
 *
 * Only tags `sanitizeHtml` allowlists are used. Anything else would reach
 * the guest as visible escaped angle brackets — the template would be
 * shipping its own bug.
 */
function buildTextSection(html: string): Extract<Section, { type: 'text' }> {
  const base = createSection('text') as Extract<Section, { type: 'text' }>
  return { ...base, props: { html } }
}

/**
 * A video section with a caption but no id.
 *
 * `VideoSection` renders nothing for an empty `youtubeId`, so the section
 * is invisible to guests until the couple pastes their own link — which is
 * the only honest default. Shipping a real YouTube id would put a
 * stranger's video on every invitation made from this template.
 */
function buildVideoSection(caption: string): Extract<Section, { type: 'video' }> {
  const base = createSection('video') as Extract<Section, { type: 'video' }>
  return { ...base, props: { youtubeId: '', caption } }
}

const LOI_NGO_HTML =
  '<h2>Lời ngỏ</h2>' +
  '<p>Cảm ơn bạn đã dành thời gian ghé thăm trang thiệp của chúng tôi. ' +
  'Ngày trọng đại này sẽ trọn vẹn hơn rất nhiều nếu có bạn cùng chung vui.</p>' +
  '<blockquote><p>Hạnh phúc không phải là đích đến, mà là hành trình ta đi cùng nhau.</p></blockquote>'

const LUU_Y_HTML =
  '<h2>Đôi điều lưu ý</h2>' +
  '<ul>' +
  '<li><p>Vui lòng xác nhận tham dự trước ngày <strong>10/12/2026</strong> để chúng tôi chuẩn bị chỗ ngồi.</p></li>' +
  '<li><p>Bãi gửi xe nằm ngay sau sảnh tiệc, miễn phí cho toàn bộ khách mời.</p></li>' +
  '<li><p>Chương trình bắt đầu đúng giờ, mong bạn thu xếp đến sớm <em>15 phút</em>.</p></li>' +
  '</ul>'

const TRANG_PHUC_HTML =
  '<h2>Trang phục</h2>' +
  '<p>Chúng tôi mong được nhìn thấy bạn trong những gam màu nhẹ nhàng: ' +
  '<strong>kem</strong>, <strong>be</strong>, <strong>xanh pastel</strong>.</p>' +
  '<p>Nếu bạn muốn diện áo dài, chúng tôi sẽ rất vui — đó luôn là lựa chọn đẹp nhất.</p>'

const ANH_TRANG = buildTemplate({
  id: 'template-anh-trang',
  slug: 'anh-trang',
  name: 'Ánh trăng',
  category: 'elegant',
  tier: 'premium',
  theme: buildTheme({
    primary: '#1F2A44',
    secondary: '#C4B58E',
    background: '#F7F6F2',
    headingFont: 'Dancing Script',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'reveal', particles: null }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    buildStorySection(),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'hero'),
    buildVideoSection('Phóng sự ngày cưới'),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const SEN_VANG = buildTemplate({
  id: 'template-sen-vang',
  slug: 'sen-vang',
  name: 'Sen vàng',
  category: 'traditional',
  tier: 'premium',
  theme: buildTheme({
    primary: '#C9962B',
    secondary: '#8C3B2E',
    background: '#FFFDF6',
    headingFont: 'Playfair Display',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'petals', particles: 'petals' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'masonry'),
    buildTextSection(LOI_NGO_HTML),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const BIEN_XANH = buildTemplate({
  id: 'template-bien-xanh',
  slug: 'bien-xanh',
  name: 'Biển xanh',
  category: 'beach',
  tier: 'premium',
  theme: buildTheme({
    primary: '#0E6E8C',
    secondary: '#F2C078',
    background: '#F3FAFC',
    headingFont: 'Quicksand',
    bodyFont: 'Inter',
  }),
  opening: buildOpening({ effect: 'fade', particles: 'confetti' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    withAlbumLayout(findByType(base, 'album'), 'carousel'),
    buildVideoSection('Khoảnh khắc bên bờ biển'),
    findByType(base, 'events'),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const THANH_XUAN = buildTemplate({
  id: 'template-thanh-xuan',
  slug: 'thanh-xuan',
  name: 'Thanh xuân',
  category: 'playful',
  tier: 'premium',
  theme: buildTheme({
    primary: '#E2725B',
    secondary: '#6FB3A0',
    background: '#FFF9F5',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Lora',
  }),
  opening: buildOpening({ effect: 'petals', particles: 'confetti' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'hero'),
    buildTextSection(TRANG_PHUC_HTML),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const TINH_KHOI = buildTemplate({
  id: 'template-tinh-khoi',
  slug: 'tinh-khoi',
  name: 'Tinh khôi',
  category: 'minimal',
  tier: 'premium',
  theme: buildTheme({
    primary: '#7C8B8A',
    secondary: '#D8CFC4',
    background: '#FFFFFF',
    headingFont: 'Lora',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'reveal', particles: null }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'grid'),
    buildTextSection(LUU_Y_HTML),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const HOANG_HON = buildTemplate({
  id: 'template-hoang-hon',
  slug: 'hoang-hon',
  name: 'Hoàng hôn',
  category: 'romantic',
  tier: 'premium',
  theme: buildTheme({
    primary: '#C1440E',
    secondary: '#F0A868',
    background: '#FFF6EE',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
  }),
  opening: buildOpening({ effect: 'envelope', particles: 'petals' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    buildStorySection(),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'hero'),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const GAM_HOA = buildTemplate({
  id: 'template-gam-hoa',
  slug: 'gam-hoa',
  name: 'Gấm hoa',
  category: 'traditional',
  tier: 'premium',
  theme: buildTheme({
    primary: '#7B1E3B',
    secondary: '#D4AF37',
    background: '#FDF7F4',
    headingFont: 'Merriweather',
    bodyFont: 'Lora',
  }),
  opening: buildOpening({ effect: 'curtain', particles: null }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    buildStorySection(),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'masonry'),
    buildTextSection(LOI_NGO_HTML),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const MONG_MO = buildTemplate({
  id: 'template-mong-mo',
  slug: 'mong-mo',
  name: 'Mộng mơ',
  category: 'pastel',
  tier: 'premium',
  theme: buildTheme({
    primary: '#A78BC4',
    secondary: '#F6C6D0',
    background: '#FAF7FD',
    headingFont: 'Dancing Script',
    bodyFont: 'Quicksand',
  }),
  opening: buildOpening({ effect: 'petals', particles: 'petals' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'carousel'),
    buildVideoSection('Chuyện tình của chúng tôi'),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const HANH_PHUC = buildTemplate({
  id: 'template-hanh-phuc',
  slug: 'hanh-phuc',
  name: 'Hạnh phúc',
  category: 'vibrant',
  tier: 'premium',
  theme: buildTheme({
    primary: '#E14B6A',
    secondary: '#F7C548',
    background: '#FFF8F9',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Inter',
  }),
  opening: buildOpening({ effect: 'reveal', particles: 'confetti' }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    buildStorySection(),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'hero'),
    buildTextSection(LUU_Y_HTML),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

const VINH_CUU = buildTemplate({
  id: 'template-vinh-cuu',
  slug: 'vinh-cuu',
  name: 'Vĩnh cửu',
  category: 'classic',
  tier: 'premium',
  theme: buildTheme({
    primary: '#2E4A3D',
    secondary: '#B9A27A',
    background: '#F7F8F4',
    headingFont: 'Lora',
    bodyFont: 'Inter',
  }),
  opening: buildOpening({ effect: 'curtain', particles: null }),
  buildSections: (base) => [
    findByType(base, 'cover'),
    findByType(base, 'couple'),
    buildStorySection(),
    findByType(base, 'events'),
    withAlbumLayout(findByType(base, 'album'), 'masonry'),
    buildVideoSection('Thước phim kỷ niệm'),
    findByType(base, 'gift'),
    findByType(base, 'wishes'),
    findByType(base, 'form'),
  ],
})

export const PREMIUM_TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  ANH_TRANG,
  SEN_VANG,
  BIEN_XANH,
  THANH_XUAN,
  TINH_KHOI,
  HOANG_HON,
  GAM_HOA,
  MONG_MO,
  HANH_PHUC,
  VINH_CUU,
]
