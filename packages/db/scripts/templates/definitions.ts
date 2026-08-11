import {
  createDefaultDocument,
  createSection,
  type InvitationDocument,
  type Opening,
  type Section,
  type SectionType,
  type Theme,
} from '@hpwd/schema'

/**
 * The 5 Basic-tier template documents (Task 18). Factored out of
 * `seed-templates.ts` so this pure data module — no Prisma, no S3 — can be
 * imported directly by tests without needing a database or object storage.
 *
 * Each template starts from `createDefaultDocument()` (realistic Vietnamese
 * sample content throughout, no lorem ipsum) and overrides only `theme`,
 * `opening`, and — for two of the five — the section list, per the Task 18
 * brief: they must differ in theme colours, heading/body font pair, opening
 * effect/particles, and section order/visibility.
 */

export type TemplateTier = 'basic' | 'premium'

export interface TemplateDefinition {
  /** Stable id used as the `Template.id` primary key — fixed (not a fresh cuid per run) so `seed-templates.ts` can `upsert` idempotently. */
  id: string
  /** Stable short slug, e.g. used as the MinIO/R2 thumbnail object key (`templates/{slug}.png`). */
  slug: string
  name: string
  tier: TemplateTier
  category: string
  document: InvitationDocument
}

function buildTheme(overrides: Pick<Theme, 'primary' | 'secondary' | 'background' | 'headingFont' | 'bodyFont'>): Theme {
  return { ...overrides, customFonts: [] }
}

function buildOpening(overrides: Pick<Opening, 'effect' | 'particles'>): Opening {
  return { ...overrides, monogram: '', showGuestName: true }
}

function findByType<T extends SectionType>(
  sections: Section[],
  type: T,
): Extract<Section, { type: T }> {
  const found = sections.find((s): s is Extract<Section, { type: T }> => s.type === type)
  if (!found) {
    throw new Error(`createDefaultDocument() is missing a "${type}" section — template definitions assume all 7 default sections exist`)
  }
  return found
}

/** Reassigns `order` to the array index so the final section list is always contiguous 0..n-1, regardless of how sections were reordered/added above. */
function withSequentialOrder(sections: Section[]): Section[] {
  return sections.map((section, index) => ({ ...section, order: index }))
}

/** Sample Vietnamese relationship-timeline content for "Cổ điển"'s story section — no lorem ipsum. */
function buildStorySection(): Extract<Section, { type: 'story' }> {
  const base = createSection('story')
  return {
    ...base,
    props: {
      items: [
        {
          date: '2021-02-14',
          title: 'Ngày đầu gặp gỡ',
          text: 'Chúng tôi tình cờ quen nhau tại buổi họp lớp đại học, và trò chuyện với nhau suốt cả buổi tối hôm đó.',
          image: '',
        },
        {
          date: '2023-06-18',
          title: 'Lời tỏ tình',
          text: 'Sau hơn hai năm đồng hành, chú rể đã ngỏ lời yêu thương trong một buổi tối mưa nhẹ ở Đà Lạt.',
          image: '',
        },
        {
          date: '2025-11-02',
          title: 'Lời cầu hôn bất ngờ',
          text: 'Giữa những người thân yêu, chú rể quỳ gối cầu hôn và nhận được cái gật đầu đầy hạnh phúc.',
          image: '',
        },
      ],
    },
  }
}

function buildTemplate(opts: {
  id: string
  slug: string
  name: string
  category: string
  theme: Theme
  opening: Opening
  buildSections: (base: Section[]) => Section[]
}): TemplateDefinition {
  const document = createDefaultDocument()
  document.theme = opts.theme
  document.opening = opts.opening
  document.sections = withSequentialOrder(opts.buildSections(document.sections))

  return {
    id: opts.id,
    slug: opts.slug,
    name: opts.name,
    tier: 'basic',
    category: opts.category,
    document,
  }
}

const TOI_GIAN = buildTemplate({
  id: 'template-toi-gian',
  slug: 'toi-gian',
  name: 'Tối giản',
  category: 'minimal',
  theme: buildTheme({
    primary: '#2B2B2B',
    secondary: '#8A8A8A',
    background: '#FAF8F5',
    headingFont: 'Inter',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'fade', particles: null }),
  // Default document already has no story section — kept as-is.
  buildSections: (base) => base,
})

const VUON_HONG = buildTemplate({
  id: 'template-vuon-hong',
  slug: 'vuon-hong',
  name: 'Vườn hồng',
  category: 'romantic',
  theme: buildTheme({
    primary: '#B76E79',
    secondary: '#8DA47E',
    background: '#FBF3F0',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'envelope', particles: 'petals' }),
  buildSections: (base) => base,
})

const CO_DIEN = buildTemplate({
  id: 'template-co-dien',
  slug: 'co-dien',
  name: 'Cổ điển',
  category: 'classic',
  theme: buildTheme({
    primary: '#5C1A26',
    secondary: '#C9A227',
    background: '#FFFBF0',
    headingFont: 'Playfair Display',
    bodyFont: 'Lora',
  }),
  opening: buildOpening({ effect: 'curtain', particles: null }),
  buildSections: (base) => {
    const cover = findByType(base, 'cover')
    const couple = findByType(base, 'couple')
    const events = findByType(base, 'events')
    const album = findByType(base, 'album')
    const gift = findByType(base, 'gift')
    const wishes = findByType(base, 'wishes')
    const form = findByType(base, 'form')
    return [cover, couple, buildStorySection(), events, album, gift, wishes, form]
  },
})

const MOC_MAC = buildTemplate({
  id: 'template-moc-mac',
  slug: 'moc-mac',
  name: 'Mộc mạc',
  category: 'rustic',
  theme: buildTheme({
    primary: '#B5651D',
    secondary: '#DCC7A1',
    background: '#FFF8EF',
    headingFont: 'Merriweather',
    bodyFont: 'Be Vietnam Pro',
  }),
  opening: buildOpening({ effect: 'envelope', particles: null }),
  buildSections: (base) => base,
})

const HIEN_DAI = buildTemplate({
  id: 'template-hien-dai',
  slug: 'hien-dai',
  name: 'Hiện đại',
  category: 'modern',
  theme: buildTheme({
    primary: '#0B0B0F',
    secondary: '#2F6FED',
    background: '#F4F5F7',
    headingFont: 'Be Vietnam Pro',
    bodyFont: 'Inter',
  }),
  opening: buildOpening({ effect: 'fade', particles: 'confetti' }),
  buildSections: (base) => {
    const cover = findByType(base, 'cover')
    const couple = findByType(base, 'couple')
    const events = findByType(base, 'events')
    const album = findByType(base, 'album')
    const gift = findByType(base, 'gift')
    const wishes = findByType(base, 'wishes')
    const form = findByType(base, 'form')
    return [cover, couple, album, events, gift, wishes, form]
  },
})

export const BASIC_TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  TOI_GIAN,
  VUON_HONG,
  CO_DIEN,
  MOC_MAC,
  HIEN_DAI,
]
