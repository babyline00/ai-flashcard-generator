import { describe, expect, test } from 'bun:test'

import { parseCardsResponse } from '../card-parser'

describe('parseCardsResponse', () => {
  test('parses a clean JSON array of cards', () => {
    const input = JSON.stringify([
      { type: 'cloze', front: 'The capital of France is {{c1::Paris}}.', back: '' },
      { type: 'qa', front: 'What is 2+2?', back: '4' },
    ])
    const out = parseCardsResponse(input)
    expect(out.length).toBe(2)
    expect(out[0].type).toBe('cloze')
    expect(out[0].front).toContain('{{c1::Paris}}')
    expect(out[1].type).toBe('qa')
    expect(out[1].back).toBe('4')
  })

  test('parses fenced JSON (```json ... ```)', () => {
    const input = '```json\n[{"type":"qa","front":"Q","back":"A"}]\n```'
    const out = parseCardsResponse(input)
    expect(out.length).toBe(1)
    expect(out[0].front).toBe('Q')
  })

  test('parses fenced JSON without language tag', () => {
    const input = '```\n[{"type":"qa","front":"Q","back":"A"}]\n```'
    const out = parseCardsResponse(input)
    expect(out.length).toBe(1)
  })

  test('parses prose-wrapped JSON', () => {
    const input =
      'Sure, here are your cards:\n' +
      '[{"type":"qa","front":"Q","back":"A"}]\n' +
      'Let me know if you want more.'
    const out = parseCardsResponse(input)
    expect(out.length).toBe(1)
    expect(out[0].back).toBe('A')
  })

  test('returns [] for malformed JSON', () => {
    expect(parseCardsResponse('not json at all')).toEqual([])
    expect(parseCardsResponse('')).toEqual([])
    expect(parseCardsResponse(null as any)).toEqual([])
    expect(parseCardsResponse(undefined as any)).toEqual([])
  })

  test('returns [] when LLM emits a JSON object instead of array', () => {
    expect(parseCardsResponse('{"type":"qa","front":"Q","back":"A"}')).toEqual([])
  })

  test('drops cards with invalid type', () => {
    const input = JSON.stringify([
      { type: 'unknown', front: 'Q', back: 'A' },
      { type: 'qa', front: 'Q', back: 'A' },
    ])
    const out = parseCardsResponse(input)
    expect(out.length).toBe(1)
    expect(out[0].type).toBe('qa')
  })

  test('drops cards with neither front nor back', () => {
    const input = JSON.stringify([
      { type: 'qa', front: '', back: '' },
      { type: 'qa', front: 'Q', back: 'A' },
    ])
    const out = parseCardsResponse(input)
    expect(out.length).toBe(1)
    expect(out[0].front).toBe('Q')
  })

  test('preserves imagePrompt only for image-type cards', () => {
    const input = JSON.stringify([
      {
        type: 'image',
        front: '{{c1::image: water cycle}}',
        back: 'A diagram showing evaporation and precipitation.',
        imagePrompt: 'water cycle',
      },
      {
        type: 'qa',
        front: 'Q',
        back: 'A',
        imagePrompt: 'should be dropped for non-image cards',
      },
    ])
    const out = parseCardsResponse(input)
    expect(out.length).toBe(2)
    expect(out[0].imagePrompt).toBe('water cycle')
    expect(out[1].imagePrompt).toBeUndefined()
  })

  test('lowercases + preserves tags arrays', () => {
    const input = JSON.stringify([
      { type: 'qa', front: 'Q', back: 'A', tags: ['Biology', 'Plants'] },
    ])
    const out = parseCardsResponse(input)
    expect(out[0].tags).toEqual(['biology', 'plants'])
  })

  test('repairs trailing commas + single-quoted strings', () => {
    const input =
      '[\n' +
      "  {'type': 'qa', 'front': 'Q', 'back': 'A',},\n" +
      "  {'type': 'cloze', 'front': '{{c1::x}}', 'back': '',},\n" +
      ']'
    const out = parseCardsResponse(input)
    expect(out.length).toBe(2)
    expect(out[0].type).toBe('qa')
    expect(out[1].type).toBe('cloze')
  })

  test('handles large JSON arrays (>20 cards)', () => {
    const arr = Array.from({ length: 25 }, (_, i) => ({
      type: 'qa',
      front: `Q${i}`,
      back: `A${i}`,
    }))
    const out = parseCardsResponse(JSON.stringify(arr))
    expect(out.length).toBe(25)
  })
})
