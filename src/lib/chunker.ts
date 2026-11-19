/**
 * Chunker — splits long source text into LLM-friendly chunks so the prompt
 * size stays under control when the user pastes a long PDF dump or article.
 *
 * Pure (no IO). The strategy is intentionally simple:
 *   1. Split into paragraphs on double-newlines.
 *   2. Greedily pack paragraphs into chunks of ~`targetChars` characters.
 *   3. A single paragraph larger than the target is hard-split by sentences.
 *
 * This is *not* a tokenizer-aware chunker (the LLM provider truncates long
 * input deterministically anyway), but it keeps every chunk under a
 * character budget so the user can see what's being sent.
 */

export interface SourceChunk {
  /** 1-indexed position within the source text. */
  ordinal: number
  /** Chunk text. */
  content: string
}

const DEFAULT_TARGET_CHARS = 6000

export function chunkSourceText(
  text: string,
  opts: { targetChars?: number } = {},
): SourceChunk[] {
  const targetChars = opts.targetChars ?? DEFAULT_TARGET_CHARS
  const trimmed = (text ?? '').replace(/\r\n/g, '\n').trim()
  if (!trimmed) return []

  const paragraphs = trimmed.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  const chunks: string[] = []
  let buffer = ''
  let bufferChars = 0

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
    bufferChars = 0
  }

  for (const para of paragraphs) {
    const paraChars = para.length
    if (bufferChars + paraChars > targetChars && bufferChars > 0) {
      flush()
    }
    if (paraChars > targetChars) {
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const sentence of sentences) {
        if (bufferChars + sentence.length > targetChars && bufferChars > 0) {
          flush()
        }
        buffer += (buffer ? ' ' : '') + sentence
        bufferChars += sentence.length
      }
    } else {
      buffer += (buffer ? '\n\n' : '') + para
      bufferChars += paraChars
    }
  }
  flush()

  return chunks.map((content, i) => ({ ordinal: i + 1, content }))
}
