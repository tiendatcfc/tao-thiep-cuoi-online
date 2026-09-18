import { describe, expect, test } from 'vitest'
import { InvitationDocumentSchema, TextPropsSchema, createDefaultDocument, createSection } from '../index'

test('default document hợp lệ theo schema', () => {
  expect(() => InvitationDocumentSchema.parse(createDefaultDocument())).not.toThrow()
})

test('section type lạ bị từ chối', () => {
  const doc = createDefaultDocument()
  ;(doc.sections[0] as any).type = 'hacker'
  expect(() => InvitationDocumentSchema.parse(doc)).toThrow()
})

test('createSection sinh id duy nhất và props mặc định đúng type', () => {
  const a = createSection('gift')
  const b = createSection('gift')
  expect(a.id).not.toEqual(b.id)
  expect(a.type === 'gift' && a.props.accounts).toEqual([])
})

describe('round-trip losslessness', () => {
  test('InvitationDocumentSchema.parse(createDefaultDocument()) deep-equals its input', () => {
    const doc = createDefaultDocument()
    const parsed = InvitationDocumentSchema.parse(doc)
    expect(parsed).toEqual(doc)
  })
})

// C9: the Task 8 deferral note said "add before the editor UI ships" (also
// bounds sanitizeHtml's O(n^2) worst case on pathological input), but it
// shipped unbounded in Task 16.
describe('TextPropsSchema.html length cap (C9)', () => {
  test('accepts a string at the 10_000 char limit', () => {
    expect(() => TextPropsSchema.parse({ html: 'a'.repeat(10_000) })).not.toThrow()
  })

  test('rejects a string over the 10_000 char limit', () => {
    expect(() => TextPropsSchema.parse({ html: 'a'.repeat(10_001) })).toThrow()
  })
})

test('a customFonts entry saved before assetId existed still parses, and gains an empty id', () => {
  // Every document written before the custom-font upload shipped carries
  // `{ family, url }` entries and no `assetId`. Requiring the new field
  // would make `InvitationDocumentSchema.parse` throw on them — which is
  // not a validation error but a silent, total autosave failure for that
  // whole invitation (Phase 1 blocker B1).
  const doc: any = structuredClone(createDefaultDocument())
  doc.theme.customFonts = [{ family: 'Noto Sans', url: 'https://cdn.test/a.woff2' }]

  const parsed = InvitationDocumentSchema.parse(doc)

  expect(parsed.theme.customFonts).toEqual([
    { family: 'Noto Sans', url: 'https://cdn.test/a.woff2', assetId: '' },
  ])
})

test('a customFonts entry rejects unknown keys, so a stray field cannot ride along', () => {
  const doc: any = structuredClone(createDefaultDocument())
  doc.theme.customFonts = [{ family: 'A', url: 'https://cdn.test/a.woff2', weight: 700 }]

  expect(() => InvitationDocumentSchema.parse(doc)).toThrow()
})

test('parse-time defaults backfill missing fields on partial documents (templates/migrations)', () => {
  const doc: any = structuredClone(createDefaultDocument())

  delete doc.theme.customFonts
  delete doc.music.playAfterOpen
  delete doc.opening.monogram
  delete doc.opening.showGuestName
  const formSection = doc.sections.find((s: any) => s.type === 'form')
  for (const field of formSection.props.fields) {
    delete field.options
  }

  const parsed = InvitationDocumentSchema.parse(doc)

  expect(parsed.theme.customFonts).toEqual([])
  expect(parsed.music.playAfterOpen).toBe(true)
  expect(parsed.opening.monogram).toBe('')
  expect(parsed.opening.showGuestName).toBe(true)
  const parsedForm = parsed.sections.find((s) => s.type === 'form')
  expect(parsedForm?.type === 'form' && parsedForm.props.fields.every((f) => f.options.length === 0)).toBe(true)
})

test('an album image saved before captions existed still parses, and gains an empty caption', () => {
  const doc: any = structuredClone(createDefaultDocument())
  const album = doc.sections.find((s: any) => s.type === 'album')
  album.props.images = [{ url: 'https://cdn.test/a.webp', width: 800, height: 600, blurDataUrl: 'data:,' }]

  const parsed = InvitationDocumentSchema.parse(doc)
  const parsedAlbum = parsed.sections.find((s) => s.type === 'album')

  expect(parsedAlbum && parsedAlbum.type === 'album' && parsedAlbum.props.images[0].caption).toBe('')
})

test('an album caption is capped, so one photo cannot push the document past what the editor can save', () => {
  const doc: any = structuredClone(createDefaultDocument())
  const album = doc.sections.find((s: any) => s.type === 'album')
  album.props.images = [
    { url: 'https://cdn.test/a.webp', width: 800, height: 600, blurDataUrl: 'data:,', caption: 'a'.repeat(201) },
  ]

  expect(() => InvitationDocumentSchema.parse(doc)).toThrow()
})

test('the album accepts the hero layout alongside the original three', () => {
  const doc: any = structuredClone(createDefaultDocument())
  const album = doc.sections.find((s: any) => s.type === 'album')

  for (const layout of ['grid', 'masonry', 'carousel', 'hero']) {
    album.props.layout = layout
    expect(() => InvitationDocumentSchema.parse(doc)).not.toThrow()
  }

  album.props.layout = 'collage'
  expect(() => InvitationDocumentSchema.parse(doc)).toThrow()
})
