/**
 * AI-Powered Flashcard Generator — pluggable ChatProvider.
 *
 * The provider exposes one method used by the card generation pipeline:
 *   - `complete(args)`: resolves to a single string. Card generation is a
 *                       single-shot JSON task; streaming buys us nothing here
 *                       (the cards are not displayed incrementally — the UI
 *                       waits for the full JSON to parse + persist).
 *
 * Two implementations:
 *   - `ZaiProvider` : wraps the z-ai-web-dev-sdk chat completion endpoint.
 *                     The SDK is dynamically imported so unit tests that never
 *                     call the real provider do not require the SDK config to
 *                     be present at module-eval time.
 *   - `MockProvider`: deterministic responses so the UI and tests stay
 *                     demoable offline.
 */

export interface ChatProvider {
  /** Non-streaming — returns the full completion as a string. */
  complete(args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<string>
}

let cachedProvider: ChatProvider | null = null

interface ZaiCompletion {
  choices?: Array<{
    message?: { content?: string }
    delta?: { content?: string }
  }>
}

class ZaiProvider implements ChatProvider {
  private async getClient() {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    return ZAI.create()
  }

  async complete(args: { systemPrompt: string; userPrompt: string }): Promise<string> {
    const zai = await this.getClient()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      stream: false,
      thinking: { type: 'disabled' },
    })
    if (typeof completion === 'string') return completion
    const content = (completion as ZaiCompletion)?.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    return ''
  }
}

class MockProvider implements ChatProvider {
  async complete(args: { systemPrompt: string; userPrompt: string }): Promise<string> {
    // Default mock — returns an empty array of cards. Callers that need a
    // richer deterministic response inject a custom MockProvider subclass via
    // __setChatProviderForTest.
    return JSON.stringify([])
  }
}

export function getChatProvider(): ChatProvider {
  if (cachedProvider) return cachedProvider
  if (process.env.PKC_DISABLE_LLM === '1') {
    cachedProvider = new MockProvider()
    return cachedProvider
  }
  try {
    cachedProvider = new ZaiProvider()
  } catch (e) {
    console.warn('[flashgen] ZaiProvider unavailable, using MockProvider:', (e as Error).message)
    cachedProvider = new MockProvider()
  }
  return cachedProvider
}

/** Test-only — inject or clear the provider. */
export function __setChatProviderForTest(p: ChatProvider | null) {
  cachedProvider = p
}

export { MockProvider, ZaiProvider }
