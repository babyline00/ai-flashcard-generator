/**
 * Multi-format text extractor.
 *
 * Three input modes (one per export below):
 *   1. `extractFromText(input)` — pass-through (already text).
 *   2. `extractFromUrl(url)`    — fetch the page HTML, strip scripts/styles,
 *      extract main text via a simple text-extractor (no JSDOM dependency —
 *      we use a tag-stripping regex that is good enough for articles, blog
 *      posts, Wikipedia-style pages).
 *   3. `extractFromPdf(pdfBytes, pdfjsModule?)` — parse PDF bytes with
 *      `pdfjs-dist` and return `[{ pageNumber, text }]`. The pdfjs module is
 *      injected so unit tests can pass a mock implementation.
 *
 * The PDF path mirrors the pattern in sibling Project #11 (a pdf.ts module
 * that wraps pdfjs-dist's getDocument().promise -> page.getTextContent()).
 * We do NOT modify that project; we re-implement the same pattern here.
 */

export interface PdfPageText {
  pageNumber: number
  text: string
}

export interface PdfjsLike {
  getDocument: (params: { data: Uint8Array | ArrayBuffer }) => {
    promise: Promise<{
      numPages: number
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>
      }>
    }>
  }
}

/**
 * Pass-through for already-text input. Returns the input trimmed of leading/
 * trailing whitespace. Markdown is preserved — the LLM consumes it natively.
 */
export function extractFromText(input: string): string {
  if (typeof input !== 'string') return ''
  return input.replace(/\r\n/g, '\n').trim()
}

/**
 * Naive but practical HTML → text extractor. Strips script/style/noscript
 * blocks, replaces block-level closing tags with newlines, then strips all
 * remaining tags, decodes the common HTML entities, and collapses excess
 * whitespace.
 *
 * No external DOM parser (JSDOM / cheerio) is required — keeps the install
 * surface minimal and avoids native deps on the sandbox.
 */
export function stripHtml(html: string): string {
  if (!html) return ''
  let s = html
  // Remove script/style/noscript/template content entirely.
  s = s.replace(/<(script|style|noscript|template|svg|head|iframe|object)[\s\S]*?<\/\1>/gi, ' ')
  // Convert block-level closing tags into newlines so paragraphs survive.
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|td|th|br|section|article|main|blockquote|pre|ul|ol)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // Drop all remaining tags.
  s = s.replace(/<[^>]+>/g, ' ')
  // Decode a small set of common entities. (&amp; &lt; &gt; &quot; &#39; &nbsp;)
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
  // Collapse whitespace per-line, drop blank lines.
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
  return s.trim()
}

/**
 * Fetch a URL and extract its main text. Uses the global `fetch` (available
 * in Node 18+ and in the test runtime via Bun). The test mocks the global
 * fetch before invoking this function.
 *
 * Returns the stripped text. Throws on non-2xx responses or network errors.
 */
export async function extractFromUrl(url: string): Promise<string> {
  if (!url || typeof url !== 'string') {
    throw new Error('extractFromUrl: url must be a non-empty string')
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`extractFromUrl: invalid url "${url}"`)
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`extractFromUrl: only http(s) supported, got "${parsed.protocol}"`)
  }

  const fetchImpl = (globalThis as any).fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('extractFromUrl: global fetch is not available')
  }

  const res = await fetchImpl(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; AI-Flashcard-Generator/0.1; +https://example.com/bot)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  if (!res || typeof res.status !== 'number' || res.status < 200 || res.status >= 300) {
    const status = res?.status ?? 'unknown'
    throw new Error(`extractFromUrl: HTTP ${status} for ${url}`)
  }
  const html = await res.text()
  return stripHtml(html)
}

/**
 * Parse PDF bytes via pdfjs-dist and return per-page text.
 *
 * The pdfjs module is injected to keep this function pure and unit-testable
 * (the real pdfjs-dist ships ~700KB of worker + wasm assets that we don't
 * want to load inside a test). When no module is provided, we lazy-load
 * `pdfjs-dist` at call time — this also avoids needing pdfjs at module eval
 * time which keeps unit tests fast.
 */
export async function extractFromPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  pdfjsModule?: PdfjsLike,
): Promise<PdfPageText[]> {
  if (!pdfBytes || (pdfBytes.byteLength ?? 0) === 0) {
    throw new Error('extractFromPdf: empty pdf bytes')
  }

  const pdfjs: PdfjsLike =
    pdfjsModule ??
    (await import('pdfjs-dist' as any) as any)

  if (!pdfjs?.getDocument) {
    throw new Error('extractFromPdf: pdfjs module missing getDocument')
  }

  // Normalize to Uint8Array; ArrayBuffer is accepted by pdfjs but copying
  // to a Uint8Array guarantees a single code path.
  const data =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes)

  const doc = await pdfjs.getDocument({ data }).promise
  const out: PdfPageText[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = (content.items ?? [])
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
    out.push({ pageNumber: i, text })
  }
  return out
}
