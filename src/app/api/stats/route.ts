import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/stats
 *   Returns aggregate counts: decks, cards, and per-type breakdown.
 *   Used by the header stats badge in the UI.
 */
export async function GET(_req: NextRequest) {
  const [decks, cards, clozeCards, qaCards, imageCards] = await Promise.all([
    db.deck.count(),
    db.card.count(),
    db.card.count({ where: { type: 'cloze' } }),
    db.card.count({ where: { type: 'qa' } }),
    db.card.count({ where: { type: 'image' } }),
  ])
  return NextResponse.json({ decks, cards, clozeCards, qaCards, imageCards })
}
