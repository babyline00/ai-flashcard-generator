import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { getChatProvider } from '@/lib/ai'
import { buildCardGenerationPrompt } from '@/lib/card-generator'
import { parseCardsResponse } from '@/lib/card-parser'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/cards/[id]/regenerate
 *
 * Re-runs the LLM to produce a fresh version of this single card. We use the
 * card's existing `front`+`back` as the "source text" snippet (the LLM never
 * sees the original source material after persistence — only this card). We
 * ask for exactly ONE card of the same type. The new card replaces the old
 * one (same id, same deck, same order); tags are preserved.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const card = await db.card.findUnique({ where: { id } })
  if (!card) {
    return NextResponse.json({ error: 'card not found' }, { status: 404 })
  }

  // The "source" for regeneration is the card itself — front + back + imagePrompt.
  const snippet = [
    `Current card type: ${card.type}`,
    `Current front: ${card.front}`,
    `Current back: ${card.back}`,
    card.imagePrompt ? `Current image prompt: ${card.imagePrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const mix = { cloze: card.type === 'cloze' ? 1 : 0, qa: card.type === 'qa' ? 1 : 0, image: card.type === 'image' ? 1 : 0 }

  const { systemPrompt, userPrompt } = buildCardGenerationPrompt(snippet, 1, mix)

  let llmRaw = ''
  try {
    llmRaw = await getChatProvider().complete({ systemPrompt, userPrompt })
  } catch (e) {
    return NextResponse.json(
      { error: `LLM completion failed: ${(e as Error).message}` },
      { status: 502 },
    )
  }
  const generated = parseCardsResponse(llmRaw)
  if (generated.length === 0) {
    return NextResponse.json(
      { error: 'LLM returned no parseable card', raw: llmRaw.slice(0, 300) },
      { status: 422 },
    )
  }
  const fresh = generated[0]

  try {
    const updated = await db.card.update({
      where: { id },
      data: {
        type: fresh.type,
        front: fresh.front.slice(0, 4000),
        back: fresh.back.slice(0, 4000),
        imagePrompt:
          fresh.type === 'image' && fresh.imagePrompt
            ? fresh.imagePrompt.slice(0, 1000)
            : card.imagePrompt,
        // Preserve existing tags across regenerations.
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json(
      { error: `update failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}
