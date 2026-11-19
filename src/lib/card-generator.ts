/**
 * Card generator prompt builder.
 *
 * Builds the LLM prompt that asks for N flashcards in a strict JSON array
 * shape. The prompt is split into a system prompt (role + JSON schema +
 * card-type definitions) and a user prompt (the source text + the count
 * budget). This separation lets the route handler cache the system prompt
 * across calls (it's invariant) and swap the user prompt per request.
 *
 * The prompt enforces three card types:
 *   "cloze" : front uses Anki cloze syntax `{{c1::answer}}` / `{{c2::answer::hint}}`.
 *   "qa"    : front = question, back = answer.
 *   "image" : front uses `{{c1::image: <prompt>}}` placeholder describing the
 *             image to use; back = written description / alt text.
 *
 * `cardTypeMix` is an optional `{ cloze, qa, image }` map of either ratios
 * (summing to 1) or absolute counts. We normalize to absolute counts and
 * surface them in the prompt so the LLM has a hard budget per type.
 */

export type CardType = 'cloze' | 'qa' | 'image'

export interface CardTypeMix {
  cloze?: number
  qa?: number
  image?: number
}

export interface GeneratedCard {
  type: CardType
  front: string
  back: string
  imagePrompt?: string
  tags?: string[]
}

const DEFAULT_MIX: CardTypeMix = { cloze: 0.4, qa: 0.4, image: 0.2 }

export function normalizeCardTypeMix(
  count: number,
  mix?: CardTypeMix,
): { cloze: number; qa: number; image: number } {
  const m = { ...DEFAULT_MIX, ...(mix ?? {}) }
  const sum = (m.cloze ?? 0) + (m.qa ?? 0) + (m.image ?? 0)
  if (sum <= 0 || !Number.isFinite(sum)) {
    return normalizeCardTypeMix(count, DEFAULT_MIX)
  }
  // Detect absolute counts (integers, sum >= count or all > 1).
  const allIntegers = [m.cloze, m.qa, m.image].every(
    (v) => Number.isInteger(v) && v >= 0,
  )
  if (allIntegers && sum >= 1 && sum <= count + 3) {
    // Already absolute. Keep them but cap at the requested total.
    let cloze = m.cloze ?? 0
    let qa = m.qa ?? 0
    let image = m.image ?? 0
    if (cloze + qa + image > count) {
      // Trim in proportion to the largest.
      const scale = count / (cloze + qa + image)
      cloze = Math.floor(cloze * scale)
      qa = Math.floor(qa * scale)
      image = Math.floor(image * scale)
    }
    return { cloze, qa, image }
  }
  // Ratios — multiply by count and round.
  const cloze = Math.round((m.cloze ?? 0) / sum * count)
  const qa = Math.round((m.qa ?? 0) / sum * count)
  const image = Math.max(0, count - cloze - qa)
  return { cloze, qa, image }
}

/**
 * System prompt — invariant across calls. Defines the assistant role, the
 * JSON schema, and the three card types in detail.
 */
export function buildCardGenerationSystemPrompt(): string {
  return [
    'You are an expert flashcard designer for Anki/Quizlet. Given source text, you generate flashcards that maximize recall while remaining concise and unambiguous.',
    '',
    'You ALWAYS respond with a single JSON array — no prose, no markdown fences, no commentary. Each array element is a card object with this exact shape:',
    '',
    '{',
    '  "type": "cloze" | "qa" | "image",',
    '  "front": string,',
    '  "back": string,',
    '  "imagePrompt": string | undefined,',
    '  "tags": string[]   // optional, lowercase topic tags',
    '}',
    '',
    'Card-type rules:',
    '1. cloze — Fill-in-the-blank. The `front` field is a complete sentence with one or more Anki cloze deletions using the syntax `{{c1::answer}}` (or `{{c1::answer::hint}}` for a hint). The first deletion MUST use `c1`, the second `c2`, etc. `back` is a short extra/explanation field (often empty string).',
    '2. qa — Question and answer. `front` is a single focused question; `back` is a single concise answer (<= 30 words). Avoid yes/no questions.',
    '3. image — Image-suggestion card. `front` uses the placeholder `{{c1::image: <one-sentence prompt describing the image to generate>}}`. `back` is a longer written description / alt text the user can read while the image is being generated. `imagePrompt` repeats the same one-sentence image prompt.',
    '',
    'General rules:',
    '- Each `front` and `back` must be self-contained (no "as mentioned above").',
    '- Do NOT duplicate information across cards.',
    '- Prefer atomic facts. One idea per card.',
    '- Escape any literal double-quotes inside `front`/`back` with backslash (\\").',
    '- Output at most the requested number of cards.',
  ].join('\n')
}

/**
 * User prompt — per request. Embeds the source text and the per-type card
 * count budget. Source text is trimmed to a soft limit so a 50-page PDF
 * paste doesn't blow the prompt budget; the caller is expected to chunk
 * long sources and call this once per chunk.
 */
export function buildCardGenerationUserPrompt(
  sourceText: string,
  count: number,
  mix?: CardTypeMix,
): string {
  const budget = normalizeCardTypeMix(count, mix)
  const trimmed = (sourceText ?? '').trim()
  const sourceBlock = trimmed.length > 8000 ? trimmed.slice(0, 8000) + '\n…[truncated]' : trimmed

  return [
    `Generate exactly ${count} flashcards from the source text below.`,
    `Budget by type: ${budget.cloze} cloze, ${budget.qa} qa, ${budget.image} image.`,
    'Return only the JSON array. No markdown, no prose.',
    '',
    '--- SOURCE TEXT START ---',
    sourceBlock,
    '--- SOURCE TEXT END ---',
  ].join('\n')
}

/** Convenience wrapper that returns both prompts in one call. */
export function buildCardGenerationPrompt(
  sourceText: string,
  count: number,
  mix?: CardTypeMix,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: buildCardGenerationSystemPrompt(),
    userPrompt: buildCardGenerationUserPrompt(sourceText, count, mix),
  }
}
