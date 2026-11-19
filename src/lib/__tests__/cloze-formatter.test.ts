import { describe, expect, test } from 'bun:test'

import { formatClozeDeletion, wrapCloze } from '../cloze-formatter'

describe('formatClozeDeletion — valid input', () => {
  test('valid cloze passes (single deletion)', () => {
    const v = formatClozeDeletion('The capital of France is {{c1::Paris}}.')
    expect(v.valid).toBe(true)
    expect(v.hasCloze).toBe(true)
    expect(v.deletions.length).toBe(1)
    expect(v.deletions[0].id).toBe('c1')
    expect(v.deletions[0].answer).toBe('Paris')
  })

  test('valid cloze with hint passes', () => {
    const v = formatClozeDeletion('{{c1::Paris::European capital}}')
    expect(v.valid).toBe(true)
    expect(v.deletions[0].hint).toBe('European capital')
  })

  test('multiple clozes pass (c1 before c2)', () => {
    const v = formatClozeDeletion('The {{c1::sun}} rises in the {{c2::east}}.')
    expect(v.valid).toBe(true)
    expect(v.deletions.length).toBe(2)
    expect(v.deletions[0].id).toBe('c1')
    expect(v.deletions[1].id).toBe('c2')
  })

  test('plain text without cloze is valid', () => {
    const v = formatClozeDeletion('just text, no cloze')
    expect(v.valid).toBe(true)
    expect(v.hasCloze).toBe(false)
    expect(v.deletions).toEqual([])
  })

  test('formatted re-emits canonical form with hint', () => {
    const v = formatClozeDeletion('X {{c1::Paris::hint}} Y')
    expect(v.formatted).toBe('X {{c1::Paris::hint}} Y')
  })
})

describe('formatClozeDeletion — error cases', () => {
  test('missing c1 is flagged', () => {
    const v = formatClozeDeletion('The capital of France is {{c2::Paris}}.')
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('c1 is missing'))).toBe(true)
  })

  test('nested braces are flagged', () => {
    const v = formatClozeDeletion('{{c1::{{nested}}}}')
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('nested'))).toBe(true)
  })

  test('unmatched {{ is flagged', () => {
    const v = formatClozeDeletion('foo {{ bar')
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('unmatched'))).toBe(true)
  })

  test('unmatched }} is flagged', () => {
    const v = formatClozeDeletion('foo }} bar')
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('unmatched'))).toBe(true)
  })

  test('empty cloze answer is flagged', () => {
    const v = formatClozeDeletion('{{c1::}}')
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('empty cloze answer'))).toBe(true)
  })

  test('non-string input is rejected', () => {
    const v = formatClozeDeletion(null as any)
    expect(v.valid).toBe(false)
    expect(v.deletions).toEqual([])
  })
})

describe('wrapCloze', () => {
  test('wraps a single answer with default id 1', () => {
    expect(wrapCloze('Paris')).toBe('{{c1::Paris}}')
  })

  test('wraps with a hint', () => {
    expect(wrapCloze('Paris', 1, 'European capital')).toBe(
      '{{c1::Paris::European capital}}',
    )
  })

  test('uses custom cloze id', () => {
    expect(wrapCloze('east', 2)).toBe('{{c2::east}}')
  })

  test('strips literal braces from the answer', () => {
    expect(wrapCloze('a{b}c')).toBe('{{c1::abc}}')
  })

  test('returns empty string for empty answer', () => {
    expect(wrapCloze('')).toBe('')
  })

  test('returns empty string for braces-only answer', () => {
    expect(wrapCloze('{{}}')).toBe('')
  })
})
