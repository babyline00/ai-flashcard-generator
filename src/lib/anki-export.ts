/**
 * Anki TSV exporter.
 *
 * Anki's basic import accepts a tab-separated file with two columns (front,
 * back) per row. For the Cloze note type, the first column is the cloze text
 * (with `{{c1::...}}` syntax) and the second is the "Extra" field. Image-
 * suggestion cards reuse the Cloze note type with `{{c1::image: <prompt>}}`
 * placeholders.
 *
 * Tab characters in card content would corrupt the TSV, so they are replaced
 * with four spaces. Newlines inside a field are converted to `<br>` (Anki
 * renders HTML in cards). The output ends with a trailing newline so the
 * last row is consumed cleanly by `bun:test`'s `assertEquals`.
 *
 * The function is pure: it does not write to disk. The route handler is
 * responsible for returning the content as a download.
 *
 * Real Anki .apkg export via the `genanki` Python package is a stretch goal
 * — see README. For MVP we ship the human-importable TSV.
 */

export type AnkiFormat = 'anki-tsv' | 'anki-cloze-tsv'

export interface CardLike {
  type: string
  front: string
  back: string
  tags?: string | string[]
  imagePrompt?: string | null
}

export interface DeckLike {
  name: string
  description?: string | null
}

const TAB_PLACEHOLDER = '    '

function escapeField(s: string): string {
  // Tab → 4 spaces (so the field never contains a real tab). Newlines → <br>.
  return (s ?? '').replace(/\t/g, TAB_PLACEHOLDER).replace(/\r?\n/g, '<br>')
}

function safeFilename(name: string): string {
  const cleaned = (name ?? '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned : 'deck'
}

/**
 * Build an Anki-importable TSV file from a list of cards.
 *
 * `format` selects the suggested filename only — the row layout is the
 * same (front\tback) so the user can pick the matching Anki note type at
 * import time:
 *   - 'anki-tsv'       → Basic note type (front=question, back=answer).
 *   - 'anki-cloze-tsv' → Cloze note type (front=text with {{c1::...}}, back=Extra).
 *
 * Cards whose `type` is not 'cloze' or 'image' are emitted as plain
 * front/back rows so they can still be imported into a Basic deck.
 */
export function exportAnki(
  cards: CardLike[],
  deck: DeckLike,
  format: AnkiFormat = 'anki-tsv',
): { filename: string; content: string } {
  const rows: string[] = []
  for (const card of cards ?? []) {
    const front = escapeField(card.front)
    const back = escapeField(card.back)
    rows.push(`${front}\t${back}`)
  }
  const content = rows.length > 0 ? rows.join('\n') + '\n' : ''
  const suffix = format === 'anki-cloze-tsv' ? '_anki_cloze.txt' : '_anki.txt'
  return {
    filename: `${safeFilename(deck?.name)}${suffix}`,
    content,
  }
}
