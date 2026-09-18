import { InvitationDocumentSchema } from '@hpwd/schema'
import { describe, expect, it } from 'vitest'
import {
  ALL_TEMPLATE_DEFINITIONS,
  BASIC_TEMPLATE_DEFINITIONS,
  PREMIUM_TEMPLATE_DEFINITIONS,
} from '../definitions'

/**
 * Spec feature 12: "10+ mẫu cầu kỳ — vẫn miễn phí". Tier here is a label
 * for how elaborate a template is, never a paywall: everything in this
 * product is free, and the gallery at `/mau-thiep` has had a Premium tab
 * since Phase 1 that until now showed an empty list.
 */
describe('PREMIUM_TEMPLATE_DEFINITIONS', () => {
  it('delivers the ten templates the spec promises', () => {
    expect(PREMIUM_TEMPLATE_DEFINITIONS).toHaveLength(10)
  })

  it('every premium document passes InvitationDocumentSchema', () => {
    // A template that does not parse is worse than a missing one: the
    // couple picks it, the editor loads it, and autosave silently never
    // fires for their whole invitation.
    for (const def of PREMIUM_TEMPLATE_DEFINITIONS) {
      expect(() => InvitationDocumentSchema.parse(def.document), def.slug).not.toThrow()
    }
  })

  it('every premium template is tier "premium"', () => {
    for (const def of PREMIUM_TEMPLATE_DEFINITIONS) {
      expect(def.tier, def.slug).toBe('premium')
    }
  })

  it('section order is contiguous from 0 in every premium template', () => {
    for (const def of PREMIUM_TEMPLATE_DEFINITIONS) {
      const orders = def.document.sections.map((s) => s.order).sort((a, b) => a - b)
      expect(orders, def.slug).toEqual(def.document.sections.map((_, i) => i))
    }
  })

  it('each one earns the label by using something no basic template does', () => {
    // Otherwise "Premium" would be ten more colour schemes. What makes a
    // template elaborate here is the machinery Phases 2 and 3 added:
    // the reveal/petals openings, the hero album layout, and the video,
    // story and rich-text sections.
    const basicEffects = new Set(BASIC_TEMPLATE_DEFINITIONS.map((t) => t.document.opening.effect))
    const basicSectionTypes = new Set(
      BASIC_TEMPLATE_DEFINITIONS.flatMap((t) => t.document.sections.map((s) => s.type)),
    )

    for (const def of PREMIUM_TEMPLATE_DEFINITIONS) {
      const types = def.document.sections.map((s) => s.type)
      const album = def.document.sections.find((s) => s.type === 'album')
      const usesNewOpening = !basicEffects.has(def.document.opening.effect)
      const usesNewSection = types.some((t) => !basicSectionTypes.has(t))
      const usesHeroAlbum = album?.type === 'album' && album.props.layout === 'hero'

      expect(
        usesNewOpening || usesNewSection || usesHeroAlbum,
        `${def.slug} is not distinguishable from a basic template`,
      ).toBe(true)
    }
  })

  it('collectively exercises every opening effect that has a variant, and every album layout', () => {
    const effects = new Set(PREMIUM_TEMPLATE_DEFINITIONS.map((t) => t.document.opening.effect))
    for (const effect of ['envelope', 'curtain', 'fade', 'reveal', 'petals']) {
      expect(effects, `no premium template uses the ${effect} opening`).toContain(effect)
    }

    const layouts = new Set(
      PREMIUM_TEMPLATE_DEFINITIONS.flatMap((t) =>
        t.document.sections.filter((s) => s.type === 'album').map((s) => s.props.layout),
      ),
    )
    for (const layout of ['grid', 'masonry', 'carousel', 'hero']) {
      expect(layouts, `no premium template uses the ${layout} album layout`).toContain(layout)
    }
  })

  it('writes real Vietnamese copy into every rich-text section, never a placeholder', () => {
    const textSections = PREMIUM_TEMPLATE_DEFINITIONS.flatMap((t) =>
      t.document.sections.filter((s) => s.type === 'text'),
    )
    expect(textSections.length).toBeGreaterThan(0)

    for (const section of textSections) {
      if (section.type !== 'text') throw new Error('expected a text section')
      const html = section.props.html
      expect(html.length).toBeGreaterThan(40)
      expect(html.toLowerCase()).not.toContain('lorem')
      // Only tags `sanitizeHtml` allowlists may appear — anything else
      // would render as visible escaped angle brackets on the invitation.
      const tags = [...html.matchAll(/<\/?([a-z0-9]+)[^>]*>/g)].map((m) => m[1])
      for (const tag of tags) {
        expect(['p', 'strong', 'em', 'u', 's', 'span', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'br']).toContain(tag)
      }
    }
  })

  it('leaves every video section empty for the couple to fill, rather than embedding a stranger\'s video', () => {
    const videoSections = PREMIUM_TEMPLATE_DEFINITIONS.flatMap((t) =>
      t.document.sections.filter((s) => s.type === 'video'),
    )
    expect(videoSections.length).toBeGreaterThan(0)

    for (const section of videoSections) {
      if (section.type !== 'video') throw new Error('expected a video section')
      // `VideoSection` renders nothing for an empty id, so the section is
      // invisible to guests until the couple pastes their own link — which
      // is the right default. Shipping a real YouTube id would put someone
      // else's video on every invitation made from this template.
      expect(section.props.youtubeId).toBe('')
      expect(section.props.caption.length).toBeGreaterThan(0)
    }
  })

  it('gives every story section real timeline copy', () => {
    const storySections = PREMIUM_TEMPLATE_DEFINITIONS.flatMap((t) =>
      t.document.sections.filter((s) => s.type === 'story'),
    )
    expect(storySections.length).toBeGreaterThan(0)

    for (const section of storySections) {
      if (section.type !== 'story') throw new Error('expected a story section')
      expect(section.props.items.length).toBeGreaterThan(0)
      for (const item of section.props.items) {
        expect(item.title.length).toBeGreaterThan(0)
        expect(item.text.length).toBeGreaterThan(0)
        expect(item.text.toLowerCase()).not.toContain('lorem')
      }
    }
  })
})

describe('ALL_TEMPLATE_DEFINITIONS', () => {
  it('is the five basic plus the ten premium', () => {
    expect(ALL_TEMPLATE_DEFINITIONS).toHaveLength(15)
    expect(ALL_TEMPLATE_DEFINITIONS.filter((t) => t.tier === 'basic')).toHaveLength(5)
    expect(ALL_TEMPLATE_DEFINITIONS.filter((t) => t.tier === 'premium')).toHaveLength(10)
  })

  it('keeps every id and slug unique across both tiers', () => {
    const ids = ALL_TEMPLATE_DEFINITIONS.map((t) => t.id)
    const slugs = ALL_TEMPLATE_DEFINITIONS.map((t) => t.slug)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('leaves the five original templates byte-identical in id, slug, name and tier', () => {
    // `seed-templates.ts` upserts by these fixed ids. Renaming one would
    // orphan the row and silently create a duplicate template; changing a
    // slug would break the thumbnail object key that the gallery renders.
    expect(
      ALL_TEMPLATE_DEFINITIONS.filter((t) => t.tier === 'basic').map((t) => [t.id, t.slug, t.name, t.tier]),
    ).toEqual([
      ['template-toi-gian', 'toi-gian', 'Tối giản', 'basic'],
      ['template-vuon-hong', 'vuon-hong', 'Vườn hồng', 'basic'],
      ['template-co-dien', 'co-dien', 'Cổ điển', 'basic'],
      ['template-moc-mac', 'moc-mac', 'Mộc mạc', 'basic'],
      ['template-hien-dai', 'hien-dai', 'Hiện đại', 'basic'],
    ])
  })

  it('gives all fifteen templates a distinct primary colour and a distinct font pair', () => {
    // Two templates that look the same in the gallery are one template with
    // two names, whatever their section lists differ by.
    const primaries = ALL_TEMPLATE_DEFINITIONS.map((t) => t.document.theme.primary)
    const fontPairs = ALL_TEMPLATE_DEFINITIONS.map(
      (t) => `${t.document.theme.headingFont}/${t.document.theme.bodyFont}`,
    )
    expect(new Set(primaries).size).toBe(primaries.length)
    expect(new Set(fontPairs).size).toBe(fontPairs.length)
  })

  it('uses only fonts the app can actually serve', () => {
    // `fonts.css` declares `@font-face` for exactly these eight families.
    // A template naming anything else would render in the fallback stack
    // with no indication why.
    const available = new Set([
      'Playfair Display',
      'Cormorant Garamond',
      'Lora',
      'Be Vietnam Pro',
      'Quicksand',
      'Dancing Script',
      'Merriweather',
      'Inter',
    ])
    for (const def of ALL_TEMPLATE_DEFINITIONS) {
      expect(available, `${def.slug} heading`).toContain(def.document.theme.headingFont)
      expect(available, `${def.slug} body`).toContain(def.document.theme.bodyFont)
    }
  })

  it('starts every template with a cover section', () => {
    for (const def of ALL_TEMPLATE_DEFINITIONS) {
      expect(def.document.sections[0]?.type, def.slug).toBe('cover')
    }
  })
})
