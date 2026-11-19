import { describe, expect, test } from 'bun:test'

import { exportQuizlet } from '../quizlet-export'

describe('exportQuizlet', () => {
  test('returns CSV with the Term,Definition header line', () => {
    const out = exportQuizlet([], { name: 'My Deck' })
    expect(out.content).toBe('Term,Definition\n')
    expect(out.filename).toBe('My_Deck_quizlet.csv')
  })

  test('escapes commas in fields by wrapping in quotes', () => {
    const cards = [{ type: 'qa', front: 'Hello, world', back: 'Hi' }]
    const out = exportQuizlet(cards, { name: 'D' })
    expect(out.content).toContain('"Hello, world",Hi')
  })

  test('escapes newlines in fields by wrapping in quotes', () => {
    const cards = [{ type: 'qa', front: 'Line1\nLine2', back: 'X' }]
    const out = exportQuizlet(cards, { name: 'D' })
    expect(out.content).toContain('"Line1\nLine2"')
  })

  test('doubles internal double-quotes inside quoted fields', () => {
    const cards = [{ type: 'qa', front: 'He said "hi"', back: 'X' }]
    const out = exportQuizlet(cards, { name: 'D' })
    expect(out.content).toContain('"He said ""hi"""')
  })

  test('does NOT quote simple fields (no special chars)', () => {
    const cards = [{ type: 'qa', front: 'Q', back: 'A' }]
    const out = exportQuizlet(cards, { name: 'D' })
    expect(out.content).toContain('Q,A')
  })

  test('emits exactly one row per card after the header', () => {
    const cards = [
      { type: 'qa', front: 'Q1', back: 'A1' },
      { type: 'qa', front: 'Q2', back: 'A2' },
      { type: 'qa', front: 'Q3', back: 'A3' },
    ]
    const out = exportQuizlet(cards, { name: 'D' })
    const lines = out.content.split('\n').filter(Boolean)
    expect(lines.length).toBe(4) // header + 3 rows
    expect(lines[0]).toBe('Term,Definition')
    expect(lines[1]).toBe('Q1,A1')
    expect(lines[2]).toBe('Q2,A2')
    expect(lines[3]).toBe('Q3,A3')
  })

  test('filename ends with _quizlet.csv', () => {
    const out = exportQuizlet([{ type: 'qa', front: 'Q', back: 'A' }], {
      name: 'Test',
    })
    expect(out.filename).toBe('Test_quizlet.csv')
  })

  test('sanitizes deck name with special chars', () => {
    const out = exportQuizlet([], { name: 'Spaced Rep / Set: 1' })
    expect(out.filename).toBe('Spaced_Rep_Set_1_quizlet.csv')
  })

  test('handles empty cards array (still emits the header)', () => {
    const out = exportQuizlet([], { name: 'D' })
    expect(out.content).toBe('Term,Definition\n')
  })
})
