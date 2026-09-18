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
 * Shared building blocks for every template document, Basic and Premium.
 *
 * Pure data — no Prisma, no S3 — so tests can import it without a database
 * or object storage, and so `definitions.ts` (Basic) and `premium.ts` can
 * both depend on it without importing each other.
 *
 * Every template starts from `createDefaultDocument()` (realistic
 * Vietnamese sample content throughout, never lorem ipsum) and overrides
 * `theme`, `opening` and the section list.
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

export function buildTheme(overrides: Pick<Theme, 'primary' | 'secondary' | 'background' | 'headingFont' | 'bodyFont'>): Theme {
  return { ...overrides, customFonts: [] }
}

export function buildOpening(overrides: Pick<Opening, 'effect' | 'particles'>): Opening {
  return { ...overrides, monogram: '', showGuestName: true }
}

export function findByType<T extends SectionType>(
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
export function withSequentialOrder(sections: Section[]): Section[] {
  return sections.map((section, index) => ({ ...section, order: index }))
}

/** Sample Vietnamese relationship-timeline content for "Cổ điển"'s story section — no lorem ipsum. */
export function buildStorySection(): Extract<Section, { type: 'story' }> {
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

export function buildTemplate(opts: {
  id: string
  slug: string
  name: string
  category: string
  /** Defaults to `'basic'` so the five original templates keep the exact tier they shipped with. */
  tier?: TemplateTier
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
    tier: opts.tier ?? 'basic',
    category: opts.category,
    document,
  }
}

