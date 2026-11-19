# AI-Powered Flashcard Generator

> Paste text, upload a PDF, or share a URL — get auto-generated flashcards with cloze deletions, Q&A, and image suggestions. Export to Anki (TSV) or Quizlet (CSV).

A local-first, single-user flashcard generator that uses the `z-ai-web-dev-sdk` chat-completion endpoint to turn any source material into a deck of cards. The MVP ships with three input modes, three card types, and three export formats — the LLM is the only thing between your notes and a deck you can study.

---

## Overview

Most flashcard apps start with a card you already have to write. This project inverts the flow: you give it *source material* (a paragraph, a PDF, an article URL), it asks the LLM to distill that material into N atomic cards split across three Anki-native types, and you edit/regenerate/export from a single three-column dashboard.

The whole pipeline is pure-functional and unit-tested:

```
                       ┌─────────────────┐
   text | pdf | url ───▶│ text-extractor  │──▶ sourceText
                       └─────────────────┘           │
                                                     ▼
                          ┌───────────────────────────────┐
                          │  card-generator.buildPrompt() │  (system + user)
                          └───────────────────────────────┘
                                                     │
                                                     ▼
                          ┌───────────────────────────────┐
                          │  ChatProvider.complete()       │  (z-ai-web-dev-sdk OR MockProvider)
                          └───────────────────────────────┘
                                                     │
                                                     ▼
                          ┌───────────────────────────────┐
                          │  card-parser.parseResponse()    │  (tolerant of fences / prose)
                          └───────────────────────────────┘
                                                     │
                                                     ▼
                          ┌───────────────────────────────┐
                          │  cloze-formatter (validation)  │
                          │  + Prisma persist              │
                          └───────────────────────────────┘
                                                     │
                          ┌────────────────┬───────────┴───────────┐
                          ▼                ▼                       ▼
                  exportAnki()      exportQuizlet()         React UI
                  (TSV, TSV-cloze)  (CSV)                   (edit / regen / delete)
```

The left column is the input form (text / PDF / URL). The center column is the generated cards list (editable, with regenerate/delete per card). The right column is the decks sidebar (filter, rename, delete, export).

---

## MVP scope vs. stretch goals

### MVP (this repo)

| Capability | Status |
| --- | --- |
| Paste text (markdown or plain) | ✅ `extractFromText` |
| Upload PDF — extract text via `pdfjs-dist` | ✅ `extractFromPdf` (worker-free, main-thread parse) |
| URL — fetch HTML, strip scripts/styles, extract main text | ✅ `extractFromUrl` + `stripHtml` |
| Cloze deletion cards (`{{c1::answer}}`, `{{c1::answer::hint}}`) | ✅ `cloze-formatter` |
| Q&A cards (front = question, back = answer) | ✅ |
| Image-suggestion cards (`{{c1::image: <prompt>}}`) | ✅ |
| LLM-driven generation with N cards split across the 3 types | ✅ `card-generator` + `ai.ts` |
| Tolerant JSON parser (handles ```json fences, prose, trailing commas, single quotes) | ✅ `card-parser` |
| Card editing (front / back / tags) | ✅ UI + `PATCH /api/cards/[id]` |
| Card delete | ✅ `DELETE /api/cards/[id]` |
| Per-card regenerate (uses the existing card as the "source" snippet) | ✅ `POST /api/cards/[id]/regenerate` |
| Deck management (create / rename / delete / filter) | ✅ `GET/PATCH/DELETE /api/decks/[id]` |
| Export — Anki Basic TSV | ✅ `exportAnki` (`anki-tsv`) |
| Export — Anki Cloze TSV | ✅ `exportAnki` (`anki-cloze-tsv`) |
| Export — Quizlet CSV | ✅ `exportQuizlet` (with RFC 4180 quoting) |
| Stats (decks, cards, per-type breakdown) | ✅ `GET /api/stats` |
| Light/dark theme + sticky footer + responsive layout | ✅ |

### Stretch goals (not implemented — explicit non-goals for the MVP)

- **Real Anki `.apkg` export via [`genanki`](https://github.com/kerrick/anki)** — `genanki` is a Python package. For the MVP we ship the importable TSV; the user imports it into Anki manually (File → Import). A real `.apkg` would require running a Python sidecar or porting the APKG writer to TypeScript.
- **Real Quizlet API integration** (create a set directly) — Quizlet's 2.0 API requires an OAuth client_id and is restricted to approved apps. We ship the importable CSV instead.
- **OCR for scanned PDFs** — `pdfjs-dist` only reads the embedded text layer. Scanned image PDFs return empty text. A future version would route those pages through an OCR pass (Tesseract / a vision model).
- **Real image generation** for image-suggestion cards — today the card carries an `{{c1::image: <prompt>}}` placeholder + a written description. The user pastes the prompt into an image generator manually. A future version would call the `z-ai-web-dev-sdk` image endpoint to embed the image into the Anki media folder.
- **SM-2 spaced repetition** — Anki/Quizlet already do this. A future in-app review mode would track interval/ease/dueAt per card.
- **Mobile app** (React Native / Expo) — the responsive web UI works on mobile browsers; a native app would add offline sync.

---

## Features

- **Three input modes** — switch tabs in the left panel:
  1. **Text** — paste markdown or plain text into a monospace textarea (live char count).
  2. **PDF** — file picker; the API route reads the bytes, runs `pdfjs-dist.getDocument`, and joins per-page text.
  3. **URL** — paste an article URL; the server fetches it, strips `<script>`/`<style>`/`<head>`/`<iframe>` blocks, decodes common HTML entities, and returns the main text.
- **Three card types**:
  1. **Cloze** — front is a sentence with `{{c1::answer}}` (or `{{c1::answer::hint}}`). Anki generates one card per cloze id.
  2. **Q&A** — front is a single focused question; back is a single concise answer.
  3. **Image suggestion** — front is `{{c1::image: <one-sentence prompt>}}`; back is a longer written description of the image to generate; the `imagePrompt` field is preserved separately.
- **LLM-driven generation** — `buildCardGenerationPrompt(sourceText, count, mix?)` returns a system prompt (invariant — defines the JSON schema and the three card types) + a user prompt (the source text + the per-type budget). The default mix is 40% cloze / 40% Q&A / 20% image, adjustable via `cardTypeMix` (ratios or absolute counts).
- **Tolerant parsing** — `parseCardsResponse(llmText)` strips ```json fences, finds the outermost balanced `[...]` slice, repairs trailing commas + single-quoted strings, drops cards with unknown types or empty content, and returns `[]` on any unparseable input (the UI surfaces a friendly "no cards generated" state).
- **Cloze validation** — `formatClozeDeletion(text)` parses every `{{cN::...}}` deletion, re-emits canonical syntax, and flags:
  - missing `c1` (only `c2`/`c3`/… present)
  - nested braces (`{{c1::{{nested}}}}`)
  - unmatched `{{` or `}}`
  - empty answers (`{{c1::}}`)
- **Card editing** — every card in the center column has inline edit (front, back, tags), regenerate (asks the LLM for a fresh version of just this card), and delete.
- **Deck management** — group cards into decks in the right sidebar. Decks support rename, delete (cascade), and per-deck filter (click to load).
- **Export** — three formats via the per-deck "Export" dropdown:
  - **Anki Basic (.txt)** — `front\tback` TSV. For Anki's Basic note type. Tabs in card content → 4 spaces; newlines → `<br>`.
  - **Anki Cloze (.txt)** — same TSV shape; pick the Cloze note type at import time so `{{c1::...}}` is interpreted.
  - **Quizlet (.csv)** — `Term,Definition` header + rows with RFC 4180 escaping (commas, quotes, newlines).
- **Stats badge** — the header shows live counts: decks, total cards, and per-type breakdowns.
- **Light / dark mode** — `next-themes` + shadcn/ui (New York style) with CSS variables.
- **Sticky footer + responsive 3-column layout** — collapses to a single column on mobile.

---

## Tech stack

- **Framework** — Next.js 16 (App Router) + React 19 + TypeScript 5 (strict).
- **Styling** — Tailwind CSS 4 + shadcn/ui (New York) + tw-animate-css.
- **Database** — Prisma 6 + SQLite (local file under `db/custom.db`).
- **LLM** — `z-ai-web-dev-sdk` via a pluggable `ChatProvider` (the SDK is dynamically imported so unit tests don't require its config).
- **PDF parsing** — `pdfjs-dist` (worker-free, main-thread).
- **Testing** — `bun:test` (built-in, no extra deps).
- **Linting** — `eslint-config-next` (TypeScript + core-web-vitals).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser — src/app/page.tsx (single client component)                    │
│  ┌──────────────┐  ┌────────────────────────┐  ┌──────────────────────┐   │
│  │  Source form │  │  Cards list (editable) │  │  Decks sidebar      │   │
│  │  Tabs:       │  │  per card: edit /      │  │  list + rename +    │   │
│  │  text/PDF/URL│  │  regen / delete        │  │  delete + export    │   │
│  └──────┬───────┘  └───────────┬────────────┘  └──────────┬──────────┘   │
│         │                      │                          │              │
│         │ POST /api/cards/     │ PATCH/DELETE             │ GET/PATCH/   │
│         │   generate           │ /api/cards/[id]           │ DELETE       │
│         │                      │                          │ /api/decks*  │
│         ▼                      ▼                          ▼              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js Route Handlers (src/app/api/*)                            │  │
│  │  - text-extractor.ts   (text / PDF / URL → sourceText)             │  │
│  │  - card-generator.ts   (buildCardGenerationPrompt)                 │  │
│  │  - ai.ts               (ChatProvider.complete → z-ai-web-dev-sdk) │  │
│  │  - card-parser.ts      (parseCardsResponse)                       │  │
│  │  - cloze-formatter.ts  (validate / normalize {{c1::...}})          │  │
│  │  - anki-export.ts      (exportAnki TSV)                           │  │
│  │  - quizlet-export.ts   (exportQuizlet CSV)                        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              │                                            │
│                              ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Prisma 6 + SQLite  (db/custom.db)                                 │  │
│  │  Deck 1—N Card  (deckId cascade)                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

All non-IO logic is in `src/lib/*` and is pure-functional — every file in `src/lib/__tests__/*` exercises that module in isolation, no DB or network required. The `ChatProvider` interface in `src/lib/ai.ts` has two implementations:

- `ZaiProvider` — wraps `z-ai-web-dev-sdk`'s `chat.completions.create` (non-streaming, since card generation is a one-shot JSON task).
- `MockProvider` — deterministic; used when `PKC_DISABLE_LLM=1` or when the SDK config is unavailable, so the UI stays demoable offline.

`__setChatProviderForTest()` lets tests inject a custom `MockProvider` subclass with whatever `complete()` behavior the test needs.

---

## Setup

This project is a standalone Next.js app. Prerequisites: Node 18+ (or Bun) and a working `z-ai-web-dev-sdk` config (the SDK reads its credentials from its own config file — see `.env.example`).

```bash
# 1. Install deps.
bun install   # or: npm install / pnpm install

# 2. Push the SQLite schema (creates db/custom.db).
bun run db:push

# 3. (optional) Run the unit tests.
bun test

# 4. Start the dev server.
bun run dev
# Open the Preview Panel on the right (the sandbox blocks direct localhost:3000).
```

If you don't have the `z-ai-web-dev-sdk` config set up, the app still works — `getChatProvider()` falls back to `MockProvider` and `parseCardsResponse([])` returns an empty array (the UI shows "no cards generated").

---

## Tests

The test suite lives in `src/lib/__tests__/` and uses `bun:test` (no extra deps). Run them with:

```bash
bun test
```

| File | Tests | What it covers |
| --- | ---: | --- |
| `text-extractor.test.ts` | 19 | `extractFromText` (trim/CRLF/non-string/empty), `stripHtml` (script/style blocks, tags + entities, newlines, numeric entities, empty), `extractFromUrl` (mocked fetch, non-http rejection, invalid URL, non-2xx, fetch-unavailable), `extractFromPdf` (mocked pdfjs + multi-item join + empty/null bytes + missing getDocument) |
| `card-generator.test.ts` | 14 | `buildCardGenerationPrompt` (system + user prompt shape, 3 card types, JSON schema fields, Anki cloze syntax, source text injection, count, per-type budget, SOURCE TEXT markers, truncation), `normalizeCardTypeMix` (ratios, absolute counts, trim, all-zero fallback, undefined fallback) |
| `card-parser.test.ts` | 12 | clean array, ```json fences, fences w/o lang, prose-wrapped, malformed (→ []), object-instead-of-array, invalid-type drop, empty-content drop, imagePrompt preservation, tags lowercasing, trailing-comma + single-quote repair, large array |
| `cloze-formatter.test.ts` | 17 | valid single/hint/multi deletion, plain text, canonical re-emit; missing c1, nested braces, unmatched `{{`/`}}`, empty answer, non-string; `wrapCloze` (default id, hint, custom id, brace stripping, empty answers, braces-only) |
| `anki-export.test.ts` | 10 | TSV shape, cloze column, Q&A columns, tab escape (4 spaces), newline escape (`<br>`), filenames, empty cards, deck name sanitization, all-symbol deck name |
| `quizlet-export.test.ts` | 9 | header line, comma quoting, newline quoting, doubled quotes, simple fields (no quotes), per-row emission, filename, sanitization, empty cards |
| `ai.test.ts` | 7 | deterministic mock flow, full pipeline, provider singleton, default MockProvider, custom MockProvider override, fenced+prose LLM output, malformed LLM output |
| **Total** | **88** | |

All tests are pure-functional — they don't touch Prisma, the network, or pdfjs. `extractFromUrl` mocks `globalThis.fetch`; `extractFromPdf` accepts a `PdfjsLike` mock module via the second argument.

---

## Environment variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | `file:…/db/custom.db` | **yes** | Absolute path to the SQLite file. The committed `.env` already points at the sandbox path; `.env.example` documents the format. |
| `PKC_DISABLE_LLM` | `0` | no | Set to `1` to force `MockProvider` (useful for offline dev / CI). |
| `ZAI_API_KEY` (etc.) | — | no | Read by the `z-ai-web-dev-sdk` from its own config file; listed in `.env.example` for documentation only. |

The `db:*` npm scripts inline the absolute `DATABASE_URL` so you don't have to keep the `.env` file present at runtime:

```jsonc
"db:push":    "DATABASE_URL=\"$(pwd)/db/custom.db\" prisma db push --accept-data-loss",
"db:generate":"DATABASE_URL=\"$(pwd)/db/custom.db\" prisma generate",
"db:migrate": "DATABASE_URL=\"$(pwd)/db/custom.db\" prisma migrate dev",
"db:reset":   "DATABASE_URL=\"$(pwd)/db/custom.db\" prisma migrate reset",
```

---

## Project structure

```
101-ai-flashcard-generator/
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── tailwind.config.ts
├── components.json
├── eslint.config.mjs
├── .env                     # DATABASE_URL (sandbox path)
├── .env.example             # documented template
├── .gitignore
├── LICENSE                  # MIT
├── README.md                # this file
├── prisma/
│   └── schema.prisma        # Deck / Card models
├── db/                      # SQLite file (gitignored)
└── src/
    ├── app/
    │   ├── layout.tsx       # fonts + Toaster
    │   ├── page.tsx         # 3-column client UI (input / cards / decks)
    │   ├── globals.css      # Tailwind 4 + shadcn tokens + scrollbar
    │   └── api/
    │       ├── cards/
    │       │   ├── generate/route.ts        # POST: extract → LLM → persist
    │       │   └── [id]/
    │       │       ├── route.ts             # PATCH / DELETE
    │       │       └── regenerate/route.ts  # POST: re-gen one card
    │       ├── decks/
    │       │   ├── route.ts                 # GET list
    │       │   └── [id]/
    │       │       ├── route.ts             # GET / PATCH / DELETE
    │       │       └── export/route.ts      # POST: TSV / CSV
    │       └── stats/route.ts              # GET aggregate counts
    ├── components/
    │   └── ui/               # shadcn/ui (button, card, input, textarea,
    │                         #   label, badge, separator, scroll-area,
    │                         #   select, tabs, sonner)
    └── lib/
        ├── ai.ts            # ChatProvider (Zai + Mock)
        ├── chunker.ts       # source-text chunker (kept for long inputs)
        ├── cloze-formatter.ts
        ├── card-generator.ts
        ├── card-parser.ts
        ├── text-extractor.ts
        ├── anki-export.ts
        ├── quizlet-export.ts
        ├── db.ts            # PrismaClient singleton
        ├── utils.ts         # cn()
        └── __tests__/       # 7 test files
```

---

## Case study — multi-format ingest + 3 card types + Anki/Quizlet export

This project's hardest engineering decisions weren't about the UI or the database — they were about *parsing tolerance* and *format fidelity*.

### Multi-format ingest

Three different sources, one destination (`sourceText: string`). The hard parts:

- **PDF** — `pdfjs-dist` ships a Web Worker by default; in Node the worker doesn't exist, so we run on the main thread. The `extractFromPdf` function takes the pdfjs module as an *injectable second argument* (`pdfjsModule?: PdfjsLike`) so unit tests can pass a mock and we never load the real 700KB worker bundle in test runs. The interface is the minimal `getDocument().promise → numPages → getPage().promise → getTextContent().items → join(str)` shape.
- **URL** — we *don't* use JSDOM or cheerio (extra native deps). Instead `stripHtml` does a four-step regex dance: strip `<script>`/`<style>`/`<head>`/`<iframe>` blocks; convert block-level closing tags to `\n`; drop `<br>` to `\n`; remove all remaining tags. Then decode the six common entities. It's not perfect (won't extract article main text from a sidebar-heavy page) but it's deterministic and unit-tested.
- **Text** — pass-through (markdown preserved natively by the LLM).

### Three card types

The system prompt (`buildCardGenerationSystemPrompt`) is invariant across calls — it defines the JSON schema and the three card-type rules in detail. The user prompt carries the source text + a per-type budget computed by `normalizeCardTypeMix` (which accepts either ratios or absolute counts, with a default 40/40/20 mix and a fallback for an all-zero mix). The parser (`parseCardsResponse`) tolerates the LLM returning:

- a clean JSON array,
- the same array wrapped in ```json fences (or fences without a language tag),
- the same array preceded/followed by prose ("Sure, here are your cards:\n[…]\nLet me know if you want more."),
- trailing commas inside objects/arrays,
- single-quoted strings instead of double-quoted,
- malformed JSON (in which case we return `[]` — a recoverable UX state, not a crash).

Each surviving card is validated to have a `type` in `['cloze', 'qa', 'image']` and at least one of `front`/`back`. Unknown types are silently dropped (the LLM cannot invent new card types). `imagePrompt` is preserved only for `image`-type cards.

Cloze syntax is validated by `formatClozeDeletion`: a brace-balance pass detects nested braces and unmatched `{{`/`}}`, the cloze regex parses `{{cN::answer}}` and `{{cN::answer::hint}}`, and the c1-must-be-present rule flags the common error of only emitting `c2`. `wrapCloze(answer, id?, hint?)` is the canonical writer — it strips literal `{`/`}` from the answer so the round-trip through `formatClozeDeletion` is idempotent.

### Anki/Quizlet export

- **Anki TSV** — `front\tback` per row. Tabs in card content become 4 spaces (so the row never has a stray tab that splits a field). Newlines in card content become `<br>` (Anki renders HTML in cards). The `format` argument (`'anki-tsv' | 'anki-cloze-tsv'`) only changes the suggested filename — the row layout is the same; the user picks the matching Anki note type at import time (Basic vs. Cloze).
- **Quizlet CSV** — `Term,Definition` header + one row per card, with RFC 4180 quoting: any field containing a comma, double-quote, or newline is wrapped in double-quotes; embedded double-quotes are doubled (`"` → `""`).

Both export functions are pure — they return `{ filename, content }`. The route handler turns the string into a download; the client-side `downloadFile` helper uses a `Blob` + `URL.createObjectURL`.

### What I'd do differently

1. **Real `.apkg` via `genanki`** — instead of shipping a TSV the user has to import manually, run a Python sidecar (or write a TypeScript APKG writer — the format is a SQLite DB + zip; not impossible but ~1k LOC). The Cloze note type would also get `{{c1::...}}` validation at the model level.
2. **Real Quizlet API** — replace the CSV download with a "Send to Quizlet" button that calls the Quizlet 2.0 API to create a set directly. Requires registering an OAuth client_id (Quizlet is restrictive about who they approve).
3. **Real image generation** — call the `z-ai-web-dev-sdk` image endpoint with the `imagePrompt` field, embed the generated PNG into the Anki media folder (`<img src="watcycle.png">` in the card front), and ship a real `.apkg` that bundles the media. Today the user pastes the prompt into an image generator manually.
4. **Chunked generation** — for a 50-page PDF the source text blows the 8KB user-prompt cap (the current `buildCardGenerationUserPrompt` truncates to 8KB). A future version would call `chunkSourceText` (already in `src/lib/chunker.ts`) and dispatch one LLM call per chunk, then merge + dedupe the resulting cards.
5. **OCR for scanned PDFs** — `pdfjs-dist` returns empty text for image-only PDFs. A future version would route empty pages through Tesseract (server-side WASM build) or a vision model.
6. **Per-card image generation panel** — let the user click an image-suggestion card and choose "generate with model X, style Y, aspect Z", preview, and re-roll.

### Resume bullet

> Built an AI-powered flashcard generator (Next.js 16 / TypeScript / Prisma / z-ai-web-dev-sdk) that turns text, PDF, and URL input into Anki-ready cloze/Q&A/image-suggestion cards via a pure-function pipeline (text-extractor → card-generator → card-parser → cloze-formatter → anki/quizlet exporter). Shipped 88 unit tests covering multi-format ingest, a tolerant JSON parser (handles ```json fences / prose-wrapped arrays / trailing-comma + single-quote repair), a brace-balancing cloze validator, and RFC 4180 CSV escaping — all runnable offline via a `MockProvider` that swaps in for the live LLM when its config is missing.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Push to GitHub

When you're ready to publish, from this directory:

```bash
gh repo create ai-flashcard-generator --public --source=. --remote=origin --push
```

The `.gitignore` already excludes `node_modules/`, `.next/`, `db/*.db`, and `.env`.
