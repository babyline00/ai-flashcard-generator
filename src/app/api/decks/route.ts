import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/decks
 *   Returns all decks with their card counts, newest first.
 *   Each row: { id, name, description, createdAt, updatedAt, _count: { cards } }
 */
export async function GET(_req: NextRequest) {
  const decks = await db.deck.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { cards: true } } },
    take: 200,
  })
  return NextResponse.json(decks)
}
