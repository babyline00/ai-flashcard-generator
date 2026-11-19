import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  extractFromPdf,
  extractFromText,
  extractFromUrl,
  stripHtml,
  type PdfjsLike,
} from '../text-extractor'

describe('extractFromText', () => {
  test('returns the input trimmed', () => {
    expect(extractFromText('  hello world  ')).toBe('hello world')
  })

  test('normalizes CRLF to LF', () => {
    expect(extractFromText('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  test('handles non-string input gracefully', () => {
    expect(extractFromText(undefined as any)).toBe('')
    expect(extractFromText(null as any)).toBe('')
  })

  test('returns empty string for empty input', () => {
    expect(extractFromText('')).toBe('')
    expect(extractFromText('   \n\t  ')).toBe('')
  })
})

describe('stripHtml', () => {
  test('strips script + style blocks entirely', () => {
    const html = '<script>alert(1)</script><style>.x{}</style><p>hello</p>'
    expect(stripHtml(html)).toBe('hello')
  })

  test('strips tags and decodes common entities', () => {
    expect(stripHtml('<p>Tom &amp; Jerry &quot;say&quot; hi</p>')).toBe(
      'Tom & Jerry "say" hi',
    )
  })

  test('preserves newlines from block-level closing tags', () => {
    expect(stripHtml('<p>a</p><p>b</p>')).toBe('a\nb')
  })

  test('decodes numeric entities', () => {
    expect(stripHtml('&#39;hi&#39;')).toBe("'hi'")
  })

  test('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('')
  })
})

describe('extractFromUrl', () => {
  let originalFetch: any
  beforeEach(() => {
    originalFetch = (globalThis as any).fetch
  })
  afterEach(() => {
    ;(globalThis as any).fetch = originalFetch
  })

  test('fetches the URL and returns stripped text', async () => {
    ;(globalThis as any).fetch = async () => ({
      status: 200,
      text: async () =>
        '<html><head><title>T</title><script>var x=1</script></head>' +
        '<body><p>Photosynthesis is the process by which plants make glucose.</p></body></html>',
    })
    const out = await extractFromUrl('https://example.com/photosynthesis')
    expect(out).toContain('Photosynthesis')
    expect(out).not.toContain('<p>')
    expect(out).not.toContain('var x')
  })

  test('rejects non-http(s) URLs', async () => {
    await expect(extractFromUrl('ftp://example.com/x')).rejects.toThrow()
    await expect(extractFromUrl('file:///etc/passwd')).rejects.toThrow()
  })

  test('throws on invalid URL', async () => {
    await expect(extractFromUrl('not-a-url')).rejects.toThrow()
  })

  test('throws on non-2xx responses', async () => {
    ;(globalThis as any).fetch = async () => ({
      status: 404,
      text: async () => 'nope',
    })
    await expect(extractFromUrl('https://example.com/x')).rejects.toThrow(
      /404/,
    )
  })

  test('throws when fetch is unavailable', async () => {
    ;(globalThis as any).fetch = undefined
    await expect(extractFromUrl('https://example.com/x')).rejects.toThrow(
      /fetch/,
    )
  })
})

describe('extractFromPdf', () => {
  test('mocks pdfjs and returns per-page text', async () => {
    const mockPdfjs: PdfjsLike = {
      getDocument: ({ data }) => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: (n: number) =>
            Promise.resolve({
              getTextContent: () =>
                Promise.resolve({
                  items: [{ str: `Page ${n} text. ` }],
                }),
            }),
        }) as any,
      }) as any,
    }
    const out = await extractFromPdf(new Uint8Array([1, 2, 3]), mockPdfjs)
    expect(out.length).toBe(2)
    expect(out[0].pageNumber).toBe(1)
    expect(out[0].text).toContain('Page 1')
    expect(out[1].pageNumber).toBe(2)
    expect(out[1].text).toContain('Page 2')
  })

  test('joins multiple text items on a page', async () => {
    const mockPdfjs: PdfjsLike = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () =>
            Promise.resolve({
              getTextContent: () =>
                Promise.resolve({
                  items: [{ str: 'Hello ' }, { str: 'World ' }, { str: '!' }],
                }),
            }),
        }) as any,
      }) as any,
    }
    const out = await extractFromPdf(new Uint8Array([1]), mockPdfjs)
    expect(out[0].text).toBe('Hello World !')
  })

  test('throws on empty bytes', async () => {
    await expect(extractFromPdf(new Uint8Array(0))).rejects.toThrow(/empty/)
  })

  test('throws on null bytes', async () => {
    await expect(extractFromPdf(null as any)).rejects.toThrow(/empty/)
  })

  test('throws when pdfjs module lacks getDocument', async () => {
    await expect(
      extractFromPdf(new Uint8Array([1]), {} as any),
    ).rejects.toThrow(/getDocument/)
  })
})
