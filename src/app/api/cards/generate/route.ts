import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { getChatProvider } from '@/lib/ai'
import {
  buildCardGenerationPrompt,
  type CardType,
  type GeneratedCard,
} from '@/lib/card-generator'
import { parseCardsResponse } from '@/lib/card-parser'
import {
  extractFromPdf,
  extractFromText,
  extractFromUrl,
} from '@/lib/text-extractor'

export const runtime = 'nodejs'
// Card generation may take 30-60s on a slow LLM endpoint — extend the default.
export const maxDuration = 120

interface GenerateBody {
  source?: string
  sourceType: 'text' | 'pdf' | 'url'
  count?: number
  deckId?: string
  deckName?: string
  deckDescription?: string
}

async function extractSourceText(
  sourceType: 'text' | 'pdf' | 'url',
  source: string | Uint8Array | null,
): Promise<string> {
  if (sourceType === 'text') {
    return extractFromText(typeof source === 'string' ? source : '')
  }
  if (sourceType === 'url') {
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error('missing url')
    }
    return await extractFromUrl(source)
  }
  if (sourceType === 'pdf') {
    if (!source || (source as any).byteLength === 0) {
      throw new Error('missing pdf bytes')
    }
    const pages = await extractFromPdf(source as Uint8Array)
    return pages.map((p) => p.text).join('\n\n')
  }
  throw new Error(`unsupported sourceType: ${sourceType}`)
}

/**
 * POST /api/cards/generate
 *   body: { source, sourceType, count?, deckId?, deckName?, deckDescription? }
 *   (or multipart form-data with `file`, `sourceType=pdf`, `count`, `deckId` or `deckName`)
 *
 * Extracts text, calls the LLM to generate N cards split across cloze/qa/image,
 * persists them to a new or existing deck, and returns { deck, cards }.
 */
export async function POST(req: NextRequest) {
  // ----- parse body -----
  let body: GenerateBody = { sourceType: 'text' }
  let pdfBytes: Uint8Array | null = null

  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (file instanceof File) {
      const ab = await file.arrayBuffer()
      pdfBytes = new Uint8Array(ab)
    }
    body = {
      sourceType: (form.get('sourceType') as any) ?? 'pdf',
      count: form.get('count') ? Number(form.get('count')) : undefined,
      deckId: (form.get('deckId') as string) ?? undefined,
      deckName: (form.get('deckName') as string) ?? undefined,
      deckDescription: (form.get('deckDescription') as string) ?? undefined,
      source: '',
    }
  } else {
    try {
      body = (await req.json()) as GenerateBody
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
    }
  }

  if (!body.sourceType || !['text', 'pdf', 'url'].includes(body.sourceType)) {
    return NextResponse.json({ error: 'invalid sourceType' }, { status: 400 })
  }
  const count = Math.max(1, Math.min(40, Number(body.count) || 10))

  // ----- extract source text -----
  let sourceText = ''
  try {
    if (body.sourceType === 'pdf') {
      sourceText = await extractSourceText('pdf', pdfBytes)
    } else {
      sourceText = await extractSourceText(body.sourceType, body.source ?? '')
    }
  } catch (e) {
    return NextResponse.json(
      { error: `text extraction failed: ${(e as Error).message}` },
      { status: 400 },
    )
  }
  if (!sourceText || sourceText.trim().length < 20) {
    return NextResponse.json(
      { error: 'source text is too short to extract meaningful cards (need at least ~20 chars).' },
      { status: 422 },
    )
  }

  // ----- resolve deck (create if needed) -----
  let deckId = body.deckId
  if (!deckId) {
    if (!body.deckName || !body.deckName.trim()) {
      return NextResponse.json(
        { error: 'either deckId or deckName must be provided' },
        { status: 400 },
      )
    }
    try {
      const created = await db.deck.create({
        data: {
          name: body.deckName.trim().slice(0, 200),
          description: (body.deckDescription ?? '').trim().slice(0, 1000) || null,
        },
      })
      deckId = created.id
    } catch (e) {
      return NextResponse.json(
        { error: `failed to create deck: ${(e as Error).message}` },
        { status: 500 },
      )
    }
  } else {
    const exists = await db.deck.findUnique({ where: { id: deckId } })
    if (!exists) {
      return NextResponse.json({ error: 'deckId not found' }, { status: 404 })
    }
  }

  // ----- call LLM -----
  const { systemPrompt, userPrompt } = buildCardGenerationPrompt(sourceText, count)
  let llmRaw = ''
  try {
    llmRaw = await getChatProvider().complete({ systemPrompt, userPrompt })
  } catch (e) {
    return NextResponse.json(
      { error: `LLM completion failed: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  // ----- parse + persist cards -----
  const generated = parseCardsResponse(llmRaw)
  if (generated.length === 0) {
    return NextResponse.json(
      {
        error:
          'LLM returned no parseable cards. Try a longer source text or a different mix.',
        raw: llmRaw.slice(0, 500),
        deckId,
      },
      { status: 422 },
    )
  }

  // Determine the starting order (existing cards + new ones).
  const existingCount = await db.card.count({ where: { deckId } })

  try {
    const created = await db.$transaction(
      generated.map((card: GeneratedCard, idx: number) =>
        db.card.create({
          data: {
            deckId,
            type: card.type,
            front: card.front.slice(0, 4000),
            back: card.back.slice(0, 4000),
            imagePrompt: card.imagePrompt ? card.imagePrompt.slice(0, 1000) : null,
            tags: (card.tags ?? []).slice(0, 20).join(','),
            order: existingCount + idx + 1,
          },
        }),
      ),
    )

    const deck = await db.deck.findUnique({ where: { id: deckId } })
    return NextResponse.json({ deck, cards: created })
  } catch (e) {
    return NextResponse.json(
      { error: `persist failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}

// Allow type narrowing in tests.
export type { CardType, GeneratedCard }
