import { PREMIUM_TEMPLATE_DEFINITIONS } from './premium'
import {
  buildOpening,
  buildStorySection,
  buildTemplate,
  buildTheme,
  findByType,
  type TemplateDefinition,
} from './builders'

export { type TemplateDefinition, type TemplateTier } from './builders'

/**
 * The 5 Basic-tier template documents (Task 18).
 *
 * Their ids and slugs are FIXED: `seed-templates.ts` upserts by id, and the
 * thumbnail object key is derived from the slug, so renaming either would
 * orphan the existing row and break the gallery image for every couple who
 * already picked that template.
 */
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

export { PREMIUM_TEMPLATE_DEFINITIONS } from './premium'

/** Every template the gallery and the seed script know about, both tiers. */
export const ALL_TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  ...BASIC_TEMPLATE_DEFINITIONS,
  ...PREMIUM_TEMPLATE_DEFINITIONS,
]
