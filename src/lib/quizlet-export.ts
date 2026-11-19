/**
 * Quizlet CSV exporter.
 *
 * Quizlet's text import accepts a CSV file whose header line is
 * `Term,Definition` (case-insensitive but we always emit the canonical
 * casing). Each subsequent row is `term,definition` with standard RFC 4180
 * escaping:
 *   - a field containing a comma, double-quote, or newline is wrapped in
 *     double quotes; embedded double-quotes are doubled (`"` → `""`).
 *
 * The function is pure — the route handler turns the returned string into
 * a downloadable file. Real Quizlet API integration (calling the Quizlet
 * 2.0 API to create a set directly) is a stretch goal — see README. For
 * MVP we ship the importable CSV.
 */

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

function escapeCsvField(s: string): string {
  const text = s ?? ''
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function safeFilename(name: string): string {
  const cleaned = (name ?? '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned : 'deck'
}

export function exportQuizlet(
  cards: CardLike[],
  deck: DeckLike,
): { filename: string; content: string } {
  const rows: string[] = ['Term,Definition']
  for (const card of cards ?? []) {
    rows.push(`${escapeCsvField(card.front)},${escapeCsvField(card.back)}`)
  }
  const content = rows.join('\n') + '\n'
  return {
    filename: `${safeFilename(deck?.name)}_quizlet.csv`,
    content,
  }
}
