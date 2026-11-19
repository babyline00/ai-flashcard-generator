import { describe, expect, test } from 'bun:test'

import { exportAnki } from '../anki-export'

describe('exportAnki', () => {
  test('returns TSV with cloze + Q&A cards on separate lines', () => {
    const cards = [
      { type: 'cloze', front: 'The capital of France is {{c1::Paris}}.', back: '' },
      { type: 'qa', front: 'What is 2+2?', back: '4' },
    ]
    const out = exportAnki(cards, { name: 'My Deck' }, 'anki-tsv')
    const lines = out.content.split('\n').filter(Boolean)
    expect(lines.length).toBe(2)
  })

  test('cloze cards land in the cloze column (col1 contains {{c1::...}})', () => {
    const cards = [
      { type: 'cloze', front: 'The capital of France is {{c1::Paris}}.', back: '' },
    ]
    const out = exportAnki(cards, { name: 'D' })
    const line = out.content.split('\n')[0]
    expect(line).toContain('{{c1::Paris}}')
  })

  test('Q&A cards land in the front/back columns (col1\tcol2)', () => {
    const cards = [{ type: 'qa', front: 'What is 2+2?', back: '4' }]
    const out = exportAnki(cards, { name: 'D' })
    const line = out.content.split('\n')[0]
    expect(line).toBe('What is 2+2?\t4')
  })

  test('escapes tabs in card content as 4 spaces (preserves TSV structure)', () => {
    const cards = [{ type: 'qa', front: 'a\tb', back: 'c\td' }]
    const out = exportAnki(cards, { name: 'D' })
    // The output has exactly one real tab (the separator) per row.
    const line = out.content.split('\n')[0]
    expect((line.match(/\t/g) ?? []).length).toBe(1)
    expect(line).toContain('a    b')
    expect(line).toContain('c    d')
  })

  test('escapes newlines in card content as <br>', () => {
    const cards = [{ type: 'qa', front: 'line1\nline2', back: 'x' }]
    const out = exportAnki(cards, { name: 'D' })
    const lines = out.content.split('\n')
    // First line should hold the whole card (newlines converted to <br>).
    expect(lines[0]).toContain('line1<br>line2')
    expect(lines[0]).toContain('x')
  })

  test('anki-tsv filename ends with _anki.txt', () => {
    const out = exportAnki([], { name: 'My Deck' }, 'anki-tsv')
    expect(out.filename).toBe('My_Deck_anki.txt')
  })

  test('anki-cloze-tsv filename ends with _anki_cloze.txt', () => {
    const out = exportAnki([], { name: 'My Deck' }, 'anki-cloze-tsv')
    expect(out.filename).toBe('My_Deck_anki_cloze.txt')
  })

  test('empty cards → empty content', () => {
    const out = exportAnki([], { name: 'D' })
    expect(out.content).toBe('')
  })

  test('sanitizes deck name (special chars → underscores)', () => {
    const out = exportAnki([], { name: 'Bio/Logy 101!' }, 'anki-tsv')
    expect(out.filename).toBe('Bio_Logy_101_anki.txt')
  })

  test('falls back to "deck" for an all-symbol deck name', () => {
    const out = exportAnki([], { name: '!@#$%' }, 'anki-tsv')
    expect(out.filename).toBe('deck_anki.txt')
  })
})
