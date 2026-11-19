import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/decks/[id]
 *   Returns a single deck with its cards (ordered by `order`).
 *
 * PATCH /api/decks/[id]
 *   body: { name?, description? }
 *   Rename / re-describe the deck.
 *
 * DELETE /api/decks/[id]
 *   Cascade-deletes the deck and all its cards.
 */

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const deck = await db.deck.findUnique({
    where: { id },
    include: {
      cards: { orderBy: { order: 'asc' } },
    },
  })
  if (!deck) {
    return NextResponse.json({ error: 'deck not found' }, { status: 404 })
  }
  return NextResponse.json(deck)
}

export async function PATCH(
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
  const data: { name?: string; description?: string | null } = {}
  if (typeof body?.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 200)
  }
  if (typeof body?.description === 'string') {
    data.description = body.description.trim().slice(0, 1000) || null
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'no updatable fields supplied (name, description)' },
      { status: 400 },
    )
  }
  try {
    const updated = await db.deck.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'deck not found' }, { status: 404 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  try {
    await db.deck.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'deck not found' }, { status: 404 })
  }
}
