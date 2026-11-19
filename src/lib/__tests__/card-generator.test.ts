import { describe, expect, test } from 'bun:test'

import {
  buildCardGenerationPrompt,
  buildCardGenerationSystemPrompt,
  buildCardGenerationUserPrompt,
  normalizeCardTypeMix,
} from '../card-generator'

describe('buildCardGenerationPrompt', () => {
  test('returns both system and user prompts', () => {
    const { systemPrompt, userPrompt } = buildCardGenerationPrompt(
      'Photosynthesis is the process by which plants make glucose.',
      10,
    )
    expect(typeof systemPrompt).toBe('string')
    expect(systemPrompt.length).toBeGreaterThan(100)
    expect(typeof userPrompt).toBe('string')
    expect(userPrompt.length).toBeGreaterThan(50)
  })

  test('system prompt mentions all 3 card types', () => {
    const p = buildCardGenerationSystemPrompt()
    expect(p).toContain('cloze')
    expect(p).toContain('qa')
    expect(p).toContain('image')
  })

  test('system prompt specifies the JSON schema with all 4 fields', () => {
    const p = buildCardGenerationSystemPrompt()
    expect(p).toContain('"type"')
    expect(p).toContain('"front"')
    expect(p).toContain('"back"')
    expect(p).toContain('"imagePrompt"')
    expect(p).toContain('"tags"')
  })

  test('system prompt explains Anki cloze syntax', () => {
    const p = buildCardGenerationSystemPrompt()
    expect(p).toContain('{{c1::answer}}')
    expect(p).toContain('{{c1::answer::hint}}')
  })

  test('user prompt includes the source text', () => {
    const { userPrompt } = buildCardGenerationPrompt(
      'Photosynthesis is amazing.',
      5,
    )
    expect(userPrompt).toContain('Photosynthesis is amazing.')
  })

  test('user prompt includes the requested count', () => {
    const { userPrompt } = buildCardGenerationPrompt('src', 7)
    expect(userPrompt).toMatch(/\b7\b/)
  })

  test('user prompt includes the per-type budget for default mix', () => {
    // buildCardGenerationUserPrompt returns a string (not an object), so we
    // call it directly rather than destructuring.
    const userPrompt = buildCardGenerationUserPrompt('src', 10)
    // Default mix: 4 cloze, 4 qa, 2 image.
    expect(userPrompt).toMatch(/4 cloze/)
    expect(userPrompt).toMatch(/4 qa/)
    expect(userPrompt).toMatch(/2 image/)
  })

  test('user prompt includes the SOURCE TEXT markers', () => {
    const { userPrompt } = buildCardGenerationPrompt('hello', 3)
    expect(userPrompt).toContain('SOURCE TEXT START')
    expect(userPrompt).toContain('SOURCE TEXT END')
  })

  test('user prompt truncates very long source text', () => {
    const long = 'a'.repeat(10000)
    const { userPrompt } = buildCardGenerationPrompt(long, 5)
    expect(userPrompt.length).toBeLessThan(long.length + 500)
    expect(userPrompt).toContain('[truncated]')
  })
})

describe('normalizeCardTypeMix', () => {
  test('handles ratios summing to 1', () => {
    const m = normalizeCardTypeMix(10, { cloze: 0.4, qa: 0.4, image: 0.2 })
    expect(m.cloze).toBe(4)
    expect(m.qa).toBe(4)
    expect(m.image).toBe(2)
  })

  test('handles absolute counts that fit the total', () => {
    const m = normalizeCardTypeMix(10, { cloze: 3, qa: 3, image: 4 })
    expect(m.cloze).toBe(3)
    expect(m.qa).toBe(3)
    expect(m.image).toBe(4)
  })

  test('trims absolute counts that exceed the total', () => {
    const m = normalizeCardTypeMix(5, { cloze: 10, qa: 10, image: 10 })
    expect(m.cloze + m.qa + m.image).toBeLessThanOrEqual(5)
  })

  test('falls back to default mix when all-zero sum', () => {
    const m = normalizeCardTypeMix(10, { cloze: 0, qa: 0, image: 0 })
    expect(m.cloze + m.qa + m.image).toBe(10)
    // Default 4/4/2 — but rounding Math.round can produce 4/4/2 exactly.
    expect([m.cloze, m.qa, m.image].sort()).toEqual([2, 4, 4])
  })

  test('falls back to default mix on undefined', () => {
    const m = normalizeCardTypeMix(10, undefined)
    expect(m.cloze + m.qa + m.image).toBe(10)
  })
})
