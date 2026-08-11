import { InvitationDocumentSchema } from '@hpwd/schema'
import { describe, expect, it } from 'vitest'
import { BASIC_TEMPLATE_DEFINITIONS } from '../definitions'

describe('BASIC_TEMPLATE_DEFINITIONS', () => {
  it('has exactly 5 templates with the expected Vietnamese names, in order', () => {
    expect(BASIC_TEMPLATE_DEFINITIONS.map((t) => t.name)).toEqual([
      'Tối giản',
      'Vườn hồng',
      'Cổ điển',
      'Mộc mạc',
      'Hiện đại',
    ])
  })

  it('every template document passes InvitationDocumentSchema', () => {
    for (const def of BASIC_TEMPLATE_DEFINITIONS) {
      expect(() => InvitationDocumentSchema.parse(def.document)).not.toThrow()
    }
  })

  it('every template has a unique id and a unique slug', () => {
    const ids = BASIC_TEMPLATE_DEFINITIONS.map((t) => t.id)
    const slugs = BASIC_TEMPLATE_DEFINITIONS.map((t) => t.slug)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every template is tier "basic"', () => {
    for (const def of BASIC_TEMPLATE_DEFINITIONS) {
      expect(def.tier).toBe('basic')
    }
  })

  it('every template has distinct theme colors and distinct heading/body font pairs', () => {
    const primaries = BASIC_TEMPLATE_DEFINITIONS.map((t) => t.document.theme.primary)
    const fontPairs = BASIC_TEMPLATE_DEFINITIONS.map(
      (t) => `${t.document.theme.headingFont}/${t.document.theme.bodyFont}`,
    )
    expect(new Set(primaries).size).toBe(primaries.length)
    expect(new Set(fontPairs).size).toBe(fontPairs.length)
  })

  it('"Cổ điển" includes a story section placed before the events section', () => {
    const coDien = BASIC_TEMPLATE_DEFINITIONS.find((t) => t.slug === 'co-dien')
    expect(coDien).toBeDefined()
    const types = coDien!.document.sections.map((s) => s.type)
    expect(types).toContain('story')
    expect(types.indexOf('story')).toBeLessThan(types.indexOf('events'))
    // Section content itself must be real Vietnamese sample copy, not empty.
    const story = coDien!.document.sections.find((s) => s.type === 'story')
    if (story?.type !== 'story') throw new Error('expected a story section')
    expect(story.props.items.length).toBeGreaterThan(0)
    for (const item of story.props.items) {
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.text.length).toBeGreaterThan(0)
      expect(item.text.toLowerCase()).not.toContain('lorem')
    }
  })

  it('"Tối giản" has no story section', () => {
    const toiGian = BASIC_TEMPLATE_DEFINITIONS.find((t) => t.slug === 'toi-gian')
    expect(toiGian).toBeDefined()
    expect(toiGian!.document.sections.some((s) => s.type === 'story')).toBe(false)
  })

  it('"Hiện đại" places the album section before the events section', () => {
    const hienDai = BASIC_TEMPLATE_DEFINITIONS.find((t) => t.slug === 'hien-dai')
    expect(hienDai).toBeDefined()
    const types = hienDai!.document.sections.map((s) => s.type)
    expect(types.indexOf('album')).toBeLessThan(types.indexOf('events'))
  })

  it('opening effect/particles match the spec for each template', () => {
    const expected: Record<string, { effect: string; particles: string | null }> = {
      'toi-gian': { effect: 'fade', particles: null },
      'vuon-hong': { effect: 'envelope', particles: 'petals' },
      'co-dien': { effect: 'curtain', particles: null },
      'moc-mac': { effect: 'envelope', particles: null },
      'hien-dai': { effect: 'fade', particles: 'confetti' },
    }
    for (const def of BASIC_TEMPLATE_DEFINITIONS) {
      expect(def.document.opening.effect).toBe(expected[def.slug]?.effect)
      expect(def.document.opening.particles).toBe(expected[def.slug]?.particles)
    }
  })

  it('section `order` is contiguous starting at 0 for every template (schema requires order >= 0, but a coherent document should not have gaps or duplicates)', () => {
    for (const def of BASIC_TEMPLATE_DEFINITIONS) {
      const orders = def.document.sections.map((s) => s.order).sort((a, b) => a - b)
      expect(orders).toEqual(def.document.sections.map((_, i) => i))
    }
  })
})
