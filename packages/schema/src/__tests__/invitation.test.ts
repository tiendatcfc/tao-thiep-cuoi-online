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
