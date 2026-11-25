# CourseAtlas

CourseAtlas is a local-first revision workbench for multi-PDF courses. A course contains lecture PDFs; each PDF becomes a lecture with a three-level review outline (chapter 鈫?section 鈫?knowledge point), bilingual summaries and page-anchored evidence. The assistant answers from the course first and labels every fallback.

This repository contains the runnable application, tests and synthetic sample material only. Assessment documents, personal information and real course files are intentionally not included.

**README prose word count:** approximately 698 words.


## Status

**Implemented**

- Course CRUD and a sequential PDF upload queue with per-file states.
- PDF-only validation; text-layer extraction with page numbers preserved.
- AI-generated three-level outline using the selected model, plus a labelled local fallback.
- English/Chinese summaries; UI language switches the displayed summary.
- Original PDF page links, source excerpts and an outline editor.
- Bounded model-selected tools: course catalogue, outline, chunk search, page read and topic.
- Recent-turn plus extractive-summary conversation memory.
- Source routing with visible course/model/web labels.
- Encrypted model registry; keys never returned to the browser.
- Markdown answers with KaTeX formulas.
- Automated tests and a production build.

**Simulated**

A local mock model (`scripts/mock-llm.mjs`) is provided for deterministic testing. It is not a real provider and is not used unless configured.

**Planned**

OCR for scanned PDFs, PPTX import, multilingual embeddings and a single-page canvas viewer.

## Requirements

- Node.js 24 or newer
- npm
- A modern browser

## Run

```bash
npm install
npm run samples      # optional: create synthetic PDFs in samples/
npm run dev          # API on :3001, Vite on http://localhost:5173
```

Open `http://localhost:5173`.

Production check:

```bash
npm run build
npm start
```

## First use

1. Open **Select Model 鈫?Import Model**.
2. Enter your own OpenAI-compatible endpoint details and API key.
3. Create a course.
4. Upload a text-based PDF.
5. Wait for the outline to reach **Ready**.
6. Ask a question or open a knowledge point.

For DeepSeek, use Base URL `https://api.deepseek.com` and the current model ID (for example `deepseek-flash`); verify the ID against the provider documentation.

The API key is encrypted on the server. Do not commit `.env`, `.secrets/`, `data/` or `uploads/`.

## What to try

- Upload `samples/neural-networks/` and inspect the three-level outline.
- Ask 閳ユ凡hat are the main knowledge points in this PPT?閳?to exercise the outline tools.
- Ask a content question to exercise chunk search.
- Ask a follow-up such as 閳ユ凡hat are its limitations?閳?to exercise memory.
- Open a source card and check that the original PDF page opens.
- Use **Regenerate outline 鈫?AI** to replace an outline, or choose local mode.

## Technology

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript, Vite 7, Tailwind CSS 3 |
| i18n | i18next / react-i18next |
| API | Node.js 24, Express 4 |
| Database | SQLite via Node `node:sqlite` |
| PDF | `pdfjs-dist` |
| Retrieval | MiniSearch BM25 |
| Models | OpenAI-compatible chat completions; user-supplied key |
| Secrets | AES-256-GCM |
| Markdown | react-markdown, remark-gfm, remark-math, KaTeX |
| Tests | Vitest, Supertest |

## Project structure

```text
server/       Express API, PDF pipeline, retrieval, outline, tools, key storage
src/          React/TypeScript workbench and bilingual dictionaries
tests/        Core, API, memory, Markdown and retry tests
scripts/      sample generator and test-only mock model
samples/      synthetic PDF fixtures
public/       static favicon
```

## Privacy

- `.env`, `.secrets/`, `data/` and `uploads/` are gitignored.
- The browser only stores the selected model ID and language preference.
- PDFs remain on disk under `uploads/`; the database stores paths and metadata.
- This is a single-user local MVP; it has no authentication, rate limiting or outbound-host allowlisting.
- Real lecture PDFs and assessment documents are not part of this repository.

## Tests

```bash
npm test
```

The suite contains 16 passing tests covering PDF chunking, outline generation, retrieval, key encryption, the API flow, tool selection, memory, Markdown math and empty-answer retry.

## Development record

- Built the React/Express/SQLite workspace, PDF queue, page-level extraction and source routing.
- Added model import with AES-256-GCM key encryption and masked keys.
- Replaced the first page-level outline with a three-level AI outline after real-courseware feedback showed it was too granular; retained a labelled local fallback.
- Added bilingual summaries, original-PDF page links and the outline editor.
- Added bounded model-selected read-only tools, recent/summary memory and tool traces after generic and Chinese queries returned no evidence.
- Fixed an empty-answer failure caused by DeepSeek reasoning tokens consuming the completion budget; final answers now disable thinking and retry once on empty content.
- Verified with TypeScript, 16 automated tests, a production build and headless Edge checks.

## AI assistance

The project was developed with assistance from a DeepSeek Harness coding agent using the `deepseek-flash` model. AI was used for code scaffolding, test suggestions, bilingual copy and documentation drafts. I reviewed and revised generated code and prose, and checked the result with TypeScript, Vitest/Supertest, a production build, headless Edge runs and real PDF decks. AI was not used to fabricate citations, user-test results or evaluation metrics.

## Limitations

This is not a user study. AI outline quality was checked on a small set of real decks; chat answer quality and live Tavily search were not systematically evaluated. Retrieval is lexical, with a translation fallback for Chinese queries; paraphrase-heavy questions would benefit from embeddings. The AI outline path is capped at 150 pages.


