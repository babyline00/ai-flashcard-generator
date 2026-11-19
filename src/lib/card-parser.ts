/**
 * Card parser — extracts a JSON array of cards from the LLM's raw text
 * response.
 *
 * The LLM is asked to return only a JSON array, but in practice it often
 * wraps the array in:
 *   - markdown fences (```json ... ``` or ``` ... ```)
 *   - prose ("Here are the cards:\n[...]\nLet me know if you want more.")
 *   - or returns malformed JSON (trailing commas, single-quoted strings).
 *
 * This module is deliberately tolerant: it tries to find the outermost `[`
 * and matching `]` and parse the slice in between. If that fails it returns
 * an empty array (the route handler treats empty arrays as "no cards
 * generated" — a recoverable UX state, not a crash).
 *
 * Each surviving card is validated to have `type`, `front`, `back`. The
 * `imagePrompt` field is optional (kept only for `image`-type cards).
 * Unknown card `type` values are dropped (so the LLM cannot invent types).
 */

import type { GeneratedCard, CardType } from './card-generator'

const ALLOWED_TYPES: CardType[] = ['cloze', 'qa', 'image']

/**
 * Strip a single markdown fence (```json ... ``` or ``` ... ```). We don't
 * use a regex because the closing fence could itself contain backticks.
 */
function stripFence(text: string): string {
  const open = text.indexOf('```')
  if (open < 0) return text
  // Skip the optional language tag (e.g. ```json) up to the first newline.
  let lineEnd = text.indexOf('\n', open)
  if (lineEnd < 0) return text
  const close = text.indexOf('```', lineEnd + 1)
  if (close < 0) return text
  return text.slice(lineEnd + 1, close)
}

/**
 * Extract the outermost balanced JSON array from a string. We scan from the
 * first `[` to the matching `]` (tracking string literals + nesting depth).
 * Returns the substring (including the brackets) or '' if no balanced
 * array is found.
 */
function findBalancedArray(text: string): string {
  const start = text.indexOf('[')
  if (start < 0) return ''
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inStr) {
      if (ch === '\\') escape = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }
  // No matching `]` — try the raw slice from `[` to the end as a last resort.
  return text.slice(start)
}

/**
 * Normalize a single parsed object into a GeneratedCard. Returns null if
 * the object is not a valid card.
 */
function normalizeCard(obj: any): GeneratedCard | null {
  if (!obj || typeof obj !== 'object') return null
  const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
  if (!ALLOWED_TYPES.includes(type as CardType)) return null
  const front = typeof obj.front === 'string' ? obj.front : ''
  const back = typeof obj.back === 'string' ? obj.back : ''
  if (!front && !back) return null
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.toLowerCase())
    : []
  const imagePrompt =
    type === 'image' && typeof obj.imagePrompt === 'string' ? obj.imagePrompt : undefined
  return {
    type: type as CardType,
    front,
    back,
    imagePrompt,
    tags,
  }
}

/**
 * Parse the LLM raw response text into a list of cards. Returns [] on any
 * unparseable input.
 */
export function parseCardsResponse(llmText: string): GeneratedCard[] {
  if (!llmText || typeof llmText !== 'string') return []
  const fenceStripped = stripFence(llmText.trim())
  const arraySlice = findBalancedArray(fenceStripped)
  if (!arraySlice) return []
  let parsed: any
  try {
    parsed = JSON.parse(arraySlice)
  } catch {
    // Try one more thing — repair trailing commas + single-quoted strings.
    try {
      const repaired = arraySlice
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/'([^']*)'(?=\s*[,:}\]])/g, '"$1"')
      parsed = JSON.parse(repaired)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  const out: GeneratedCard[] = []
  for (const item of parsed) {
    const card = normalizeCard(item)
    if (card) out.push(card)
  }
  return out
}
