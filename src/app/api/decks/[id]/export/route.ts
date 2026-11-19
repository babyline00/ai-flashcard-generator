import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { exportAnki, type AnkiFormat } from '@/lib/anki-export'
import { exportQuizlet } from '@/lib/quizlet-export'

export const runtime = 'nodejs'

type ExportFormat = 'anki-tsv' | 'anki-cloze-tsv' | 'quizlet-csv'

/**
 * POST /api/decks/[id]/export
 *   body: { format: 'anki-tsv' | 'anki-cloze-tsv' | 'quizlet-csv' }
 *   Returns: { filename, content }
 *
 * For MVP we ship the human-importable TSV/CSV. Real Anki .apkg via the
 * `genanki` package + real Quizlet API integration are stretch goals.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const format: ExportFormat = body?.format
  if (!format || !['anki-tsv', 'anki-cloze-tsv', 'quizlet-csv'].includes(format)) {
    return NextResponse.json(
      { error: "format must be one of 'anki-tsv' | 'anki-cloze-tsv' | 'quizlet-csv'" },
      { status: 400 },
    )
  }

  const deck = await db.deck.findUnique({
    where: { id },
    include: { cards: { orderBy: { order: 'asc' } } },
  })
  if (!deck) {
    return NextResponse.json({ error: 'deck not found' }, { status: 404 })
  }

  if (format === 'quizlet-csv') {
    const out = exportQuizlet(deck.cards, deck)
    return NextResponse.json(out)
  }
  const out = exportAnki(deck.cards, deck, format as AnkiFormat)
  return NextResponse.json(out)
}
