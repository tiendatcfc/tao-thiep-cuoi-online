import { describe, expect, it } from 'vitest'
import { InvitationDocumentSchema, createDefaultDocument } from '../index'

/**
 * Every invitation a couple has already published is stored as JSON in
 * `Invitation.publishedDocument` and parsed by `InvitationDocumentSchema`
 * on every single page view. A field added as required — or as
 * `.optional()` without a default — makes every one of those documents
 * fail to parse, and `app/i/[slug]/page.tsx` turns a parse failure into a
 * 404. On a wedding day. For every guest at once.
 *
 * That is why the rule across this schema is `.default(...)`, never
 * `.optional()` and never bare. `.strict()` rejects UNKNOWN keys, not
 * missing-but-defaulted ones, so a document written before a field existed
 * still parses and simply gains the default.
 *
 * This file is the tripwire. It builds documents in the shape they had
 * BEFORE each round of additions — by deleting the new keys from a current
 * document, so it cannot drift out of date the way a hand-copied fixture
 * would — and asserts they still parse.
 */

type Json = Record<string, unknown>

/** Deletes a dotted path, e.g. `sections.0.props.lunarDate`, from a plain JSON clone. */
function omit(document: unknown, paths: string[]): Json {
  const clone = JSON.parse(JSON.stringify(document)) as Json
  for (const path of paths) {
    const parts = path.split('.')
    const last = parts.pop()!
    let node: Json | undefined = clone
    for (const part of parts) {
      node = node?.[part] as Json | undefined
    }
    expect(node, `path not found: ${path}`).toBeDefined()
    expect(node, `key not found: ${path}`).toHaveProperty(last)
    delete node![last]
  }
  return clone
}

function sectionIndexOf(type: string): number {
  return createDefaultDocument().sections.findIndex((section) => section.type === type)
}

describe('documents saved before a field existed keep parsing', () => {
  it('cover without `lunarDate`', () => {
    const cover = sectionIndexOf('cover')
    const legacy = omit(createDefaultDocument(), [`sections.${cover}.props.lunarDate`])

    const parsed = InvitationDocumentSchema.parse(legacy)
    const section = parsed.sections[cover]
    expect(section.type).toBe('cover')
    // Defaulted, not left undefined — the output type stays `string`, so
    // every renderer can treat it as one.
    if (section.type === 'cover') expect(section.props.lunarDate).toBe('')
  })

  it('couple without `role` / `parentsCity` on either person', () => {
    const couple = sectionIndexOf('couple')
    const legacy = omit(createDefaultDocument(), [
      `sections.${couple}.props.groom.role`,
      `sections.${couple}.props.groom.parentsCity`,
      `sections.${couple}.props.bride.role`,
      `sections.${couple}.props.bride.parentsCity`,
    ])

    const parsed = InvitationDocumentSchema.parse(legacy)
    const section = parsed.sections[couple]
    if (section.type === 'couple') {
      expect(section.props.groom.role).toBe('')
      expect(section.props.bride.parentsCity).toBe('')
    }
  })

  it('events without `guestTime` on any item', () => {
    const events = sectionIndexOf('events')
    const current = createDefaultDocument()
    const itemCount = current.sections[events].type === 'events' ? 2 : 0
    expect(itemCount).toBeGreaterThan(0)
    const legacy = omit(
      current,
      Array.from({ length: itemCount }, (_, i) => `sections.${events}.props.items.${i}.guestTime`),
    )

    const parsed = InvitationDocumentSchema.parse(legacy)
    const section = parsed.sections[events]
    if (section.type === 'events') {
      for (const item of section.props.items) expect(item.guestTime).toBe('')
    }
  })

  it('all of them missing at once, which is what a genuinely old document looks like', () => {
    const cover = sectionIndexOf('cover')
    const couple = sectionIndexOf('couple')
    const events = sectionIndexOf('events')
    const legacy = omit(createDefaultDocument(), [
      `sections.${cover}.props.lunarDate`,
      `sections.${couple}.props.groom.role`,
      `sections.${couple}.props.groom.parentsCity`,
      `sections.${couple}.props.bride.role`,
      `sections.${couple}.props.bride.parentsCity`,
      `sections.${events}.props.items.0.guestTime`,
      `sections.${events}.props.items.1.guestTime`,
    ])

    expect(() => InvitationDocumentSchema.parse(legacy)).not.toThrow()
  })

  it('still rejects an UNKNOWN key, so `.strict()` has not been quietly loosened', () => {
    // The other half of the contract. Defaults let old documents through;
    // `.strict()` is what stops a typo'd or attacker-supplied key riding
    // along into `publishedDocument`.
    const cover = sectionIndexOf('cover')
    const withJunk = JSON.parse(JSON.stringify(createDefaultDocument()))
    withJunk.sections[cover].props.lunarDatee = 'typo'

    expect(() => InvitationDocumentSchema.parse(withJunk)).toThrow()
  })
})
