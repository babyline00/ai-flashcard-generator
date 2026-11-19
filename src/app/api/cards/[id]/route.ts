import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * PATCH /api/cards/[id]
 *   body: { front?, back?, tags?, imagePrompt? }
 *   Updates editable fields. Returns the updated row.
 *
 * DELETE /api/cards/[id]
 *   Removes the card. The `order` field is left as-is (no renumbering).
 */

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
  const data: { front?: string; back?: string; tags?: string; imagePrompt?: string | null } = {}
  if (typeof body?.front === 'string') data.front = body.front.slice(0, 4000)
  if (typeof body?.back === 'string') data.back = body.back.slice(0, 4000)
  if (typeof body?.tags === 'string') {
    data.tags = body.tags
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0)
      .slice(0, 20)
      .join(',')
  }
  if (typeof body?.imagePrompt === 'string') {
    data.imagePrompt = body.imagePrompt.slice(0, 1000) || null
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'no updatable fields supplied (front, back, tags, imagePrompt)' },
      { status: 400 },
    )
  }
  try {
    const updated = await db.card.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'card not found' }, { status: 404 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  try {
    await db.card.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'card not found' }, { status: 404 })
  }
}
