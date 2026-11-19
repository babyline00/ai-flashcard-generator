import { describe, expect, test } from 'bun:test'

import {
  __setChatProviderForTest,
  getChatProvider,
  type ChatProvider,
  MockProvider,
} from '../ai'
import { buildCardGenerationPrompt } from '../card-generator'
import { parseCardsResponse } from '../card-parser'

/**
 * Deterministic ChatProvider that simulates the LLM returning three cards
 * (one per type). Used to exercise the full generation flow without a real
 * network call.
 */
class DeterministicCardsProvider implements ChatProvider {
  async complete(_args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<string> {
    return JSON.stringify([
      {
        type: 'cloze',
        front: 'The capital of France is {{c1::Paris}}.',
        back: '',
        tags: ['geography'],
      },
      {
        type: 'qa',
        front: 'What is 2+2?',
        back: '4',
        tags: ['math'],
      },
      {
        type: 'image',
        front: '{{c1::image: water cycle}}',
        back: 'A diagram showing evaporation and precipitation.',
        imagePrompt: 'water cycle',
        tags: ['science'],
      },
    ])
  }
}

describe('AI generation flow (deterministic mock)', () => {
  test('MockProvider returns deterministic cards', async () => {
    __setChatProviderForTest(new DeterministicCardsProvider())
    const provider = getChatProvider()
    const raw = await provider.complete({ systemPrompt: 'sys', userPrompt: 'src' })
    const cards = parseCardsResponse(raw)
    expect(cards.length).toBe(3)
    expect(cards[0].type).toBe('cloze')
    expect(cards[1].type).toBe('qa')
    expect(cards[2].type).toBe('image')
    expect(cards[2].imagePrompt).toBe('water cycle')
    __setChatProviderForTest(null)
  })

  test('full flow: buildCardGenerationPrompt → complete → parseCardsResponse', async () => {
    __setChatProviderForTest(new DeterministicCardsProvider())
    const { systemPrompt, userPrompt } = buildCardGenerationPrompt(
      'Photosynthesis is the process by which plants make glucose.',
      3,
    )
    const raw = await getChatProvider().complete({ systemPrompt, userPrompt })
    const cards = parseCardsResponse(raw)
    expect(cards.length).toBe(3)
    expect(cards.some((c) => c.type === 'cloze')).toBe(true)
    expect(cards.some((c) => c.type === 'qa')).toBe(true)
    expect(cards.some((c) => c.type === 'image')).toBe(true)
    __setChatProviderForTest(null)
  })

  test('getChatProvider returns the same instance on subsequent calls', () => {
    __setChatProviderForTest(new DeterministicCardsProvider())
    const a = getChatProvider()
    const b = getChatProvider()
    expect(a).toBe(b)
    __setChatProviderForTest(null)
  })

  test('default MockProvider returns an empty array', async () => {
    __setChatProviderForTest(new MockProvider())
    const raw = await getChatProvider().complete({
      systemPrompt: 'sys',
      userPrompt: 'src',
    })
    expect(JSON.parse(raw)).toEqual([])
    __setChatProviderForTest(null)
  })

  test('a custom ChatProvider subclass can override complete()', async () => {
    class CustomMock implements ChatProvider {
      async complete(): Promise<string> {
        return JSON.stringify([
          { type: 'qa', front: 'Custom Q', back: 'Custom A' },
        ])
      }
    }
    __setChatProviderForTest(new CustomMock())
    const raw = await getChatProvider().complete({
      systemPrompt: '',
      userPrompt: '',
    })
    const cards = parseCardsResponse(raw)
    expect(cards.length).toBe(1)
    expect(cards[0].front).toBe('Custom Q')
    expect(cards[0].back).toBe('Custom A')
    __setChatProviderForTest(null)
  })

  test('flow returns valid cards when LLM wraps output in fences + prose', async () => {
    class FencedProvider implements ChatProvider {
      async complete(): Promise<string> {
        return (
          'Sure, here are the cards you asked for:\n' +
          '```json\n' +
          JSON.stringify([
            { type: 'qa', front: 'Q1', back: 'A1' },
            { type: 'qa', front: 'Q2', back: 'A2' },
          ]) +
          '\n```\n' +
          'Let me know if you want more!'
        )
      }
    }
    __setChatProviderForTest(new FencedProvider())
    const raw = await getChatProvider().complete({
      systemPrompt: '',
      userPrompt: '',
    })
    const cards = parseCardsResponse(raw)
    expect(cards.length).toBe(2)
    expect(cards[0].front).toBe('Q1')
    __setChatProviderForTest(null)
  })

  test('flow tolerates a malformed LLM response (empty card list)', async () => {
    class BrokenProvider implements ChatProvider {
      async complete(): Promise<string> {
        return 'sorry, I could not generate cards this time.'
      }
    }
    __setChatProviderForTest(new BrokenProvider())
    const raw = await getChatProvider().complete({
      systemPrompt: '',
      userPrompt: '',
    })
    const cards = parseCardsResponse(raw)
    expect(cards).toEqual([])
    __setChatProviderForTest(null)
  })
})
