/**
 * Cloze formatter — validates and normalizes Anki cloze deletion syntax.
 *
 * Anki cloze syntax:
 *   `{{c1::answer}}`            — basic deletion (id "c1", answer "answer")
 *   `{{c1::answer::hint}}`      — deletion with a hint shown when the answer is hidden
 *
 * Multiple clozes in one card can be numbered c1, c2, c3, … Anki generates
 * one card per cloze id. The convention is that the FIRST cloze MUST be c1.
 *
 * This module is pure (no IO) and exposes two functions:
 *
 *   `formatClozeDeletion(text)` — returns a ClozeValidation with:
 *     - `valid`        : true iff no errors
 *     - `hasCloze`     : true iff at least one deletion was found
 *     - `deletions`    : list of parsed deletions (id, answer, hint, span, raw)
 *     - `errors`       : list of human-readable error strings
 *     - `formatted`    : the source text with every cloze re-emitted in
 *                        canonical {{c1::answer}} or {{c1::answer::hint}} form.
 *
 *   `wrapCloze(answer, id?, hint?)` — wraps a raw answer string into cloze
 *     syntax. Strips any literal `{`/`}` from the answer/hint to keep the
 *     resulting string parseable.
 *
 * Error cases covered:
 *   - missing `c1` (only `c2`, `c3`, … present)
 *   - nested braces inside a cloze (`{{c1::{{nested}}}}`)
 *   - unmatched `{{` or `}}`
 *   - empty cloze answer (`{{c1::}}`)
 */

export interface ClozeDeletion {
  /** "c1", "c2", … */
  id: string
  answer: string
  hint?: string
  /** Start index in the source text. */
  start: number
  /** End index (exclusive) in the source text. */
  end: number
  /** The exact matched substring. */
  raw: string
}

export interface ClozeValidation {
  valid: boolean
  hasCloze: boolean
  deletions: ClozeDeletion[]
  errors: string[]
  formatted: string
}

/**
 * Matches `{{cN::...}}` where the inner content contains no `{` or `}`.
 * The lazy `*?` lets the inner span include `::` (e.g. `answer::hint`).
 */
const CLOZE_RE = /\{\{(c\d+)::([^{}]*?)\}\}/g

export function formatClozeDeletion(text: string): ClozeValidation {
  if (typeof text !== 'string') {
    return {
      valid: false,
      hasCloze: false,
      deletions: [],
      errors: ['input must be a string'],
      formatted: '',
    }
  }

  const errors: string[] = []

  // Brace balance + nesting check.
  let depth = 0
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++
      if (depth > 1) errors.push(`nested '{{' at position ${i}`)
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--
      if (depth < 0) errors.push(`unmatched '}}' at position ${i}`)
    }
  }
  if (depth > 0) errors.push(`unmatched '{{' — missing ${depth} closing '}}'`)

  const deletions: ClozeDeletion[] = []
  CLOZE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  let lastIndex = 0
  const formatted: string[] = []

  while ((match = CLOZE_RE.exec(text)) !== null) {
    const [raw, id, inner] = match
    const sepIdx = inner.indexOf('::')
    const answer = sepIdx >= 0 ? inner.slice(0, sepIdx) : inner
    const hint = sepIdx >= 0 ? inner.slice(sepIdx + 2) : undefined
    if (answer.length === 0) {
      errors.push(`empty cloze answer at position ${match.index}`)
    }
    deletions.push({
      id,
      answer,
      hint,
      start: match.index,
      end: match.index + raw.length,
      raw,
    })
    formatted.push(text.slice(lastIndex, match.index))
    formatted.push(hint ? `{{${id}::${answer}::${hint}}}` : `{{${id}::${answer}}}`)
    lastIndex = match.index + raw.length
  }
  formatted.push(text.slice(lastIndex))

  if (deletions.length > 0) {
    const ids = new Set(deletions.map((d) => d.id))
    if (!ids.has('c1')) {
      errors.push(
        `cloze deletion c1 is missing (found: ${Array.from(ids).join(', ') || 'none'})`,
      )
    }
  }

  return {
    valid: errors.length === 0,
    hasCloze: deletions.length > 0,
    deletions,
    errors,
    formatted: formatted.join(''),
  }
}

/**
 * Wrap a raw answer string into a single cloze deletion. Strips literal
 * `{`/`}` from the answer/hint so the resulting string round-trips through
 * `formatClozeDeletion`. Returns '' for an empty answer.
 *
 *   wrapCloze('Paris')                -> '{{c1::Paris}}'
 *   wrapCloze('Paris', 1, 'European capital') -> '{{c1::Paris::European capital}}'
 */
export function wrapCloze(answer: string, id = 1, hint?: string): string {
  if (typeof answer !== 'string' || answer.length === 0) return ''
  const cleanAnswer = answer.replace(/[{}]/g, '')
  if (cleanAnswer.length === 0) return ''
  if (hint && typeof hint === 'string' && hint.length > 0) {
    const cleanHint = hint.replace(/[{}]/g, '')
    if (cleanHint.length > 0) {
      return `{{c${id}::${cleanAnswer}::${cleanHint}}}`
    }
  }
  return `{{c${id}::${cleanAnswer}}}`
}
