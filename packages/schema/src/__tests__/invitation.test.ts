import { describe, expect, test } from 'vitest'
import { InvitationDocumentSchema, createDefaultDocument, createSection } from '../index'

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
