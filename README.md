# CourseAtlas

CourseAtlas is a local-first revision workbench for multi-PDF courses. A course contains lecture PDFs; each PDF becomes a lecture with a three-level review outline (chapter 鈫?section 鈫?knowledge point), bilingual summaries and page-anchored evidence. The assistant answers from the course first and labels every fallback.

This repository contains the runnable application, tests and synthetic sample material only. Assessment documents, personal information and real course files are intentionally not included.

**README prose word count:** approximately 776 words.

## Status

**Implemented**

- Course CRUD and a sequential PDF upload queue with per-file states.
- PDF-only validation; text-layer extraction with page numbers preserved.
- AI-generated three-level outline using the selected model, plus a labelled local fallback.
- English/Chinese summaries; the UI language switches the displayed summary.
- Original PDF page links, source excerpts and an outline editor.
- Bounded model-selected tools: course catalogue, outline, chunk search, page read and topic.
- Recent-turn plus extractive-summary conversation memory.
- Source routing with visible course/model/web labels.
- Encrypted model registry; keys are never returned to the browser.
- Markdown answers with KaTeX formulas.
- Automated tests and a production build.

**Simulated**

A local mock model (`scripts/mock-llm.mjs`) provides deterministic chat responses for testing. It is not a real provider and is only used when explicitly configured.

**Not finished**

- OCR for scanned PDFs.
- PPTX import.
- Multilingual embeddings.
- A single-page canvas viewer.
- A reader study of whether the visible sources improve checking.

## Technology stack

| Layer | Technology | What it does |
|---|---|---|
| UI | React 19, TypeScript, Vite 7, Tailwind CSS 3 | Three-column workbench, mobile tabs, bilingual interface |
| i18n | i18next / react-i18next | English/Chinese UI and summary language |
| API | Node.js 24, Express 4 | Course, PDF, outline, model and chat routes |
| Database | SQLite via Node `node:sqlite` | Courses, lectures, topics, chunks, chat and model metadata |
| PDF | `pdfjs-dist` | Page text extraction and page numbers |
| Retrieval | MiniSearch BM25 | Chunk search and evidence ranking |
| Runtime AI | User-supplied OpenAI-compatible chat model | Outline generation, summaries, tool planning and final answers |
| Development AI | DeepSeek Harness coding agent with `deepseek-flash` | Code scaffolding, test suggestions, bilingual copy and documentation drafts; not used at runtime |
| Secrets | AES-256-GCM | Encrypt model keys at rest |
| Markdown | react-markdown, remark-gfm, remark-math, KaTeX | Formatted answers and formulas |
| Tests | Vitest, Supertest | API, retrieval, memory, Markdown and retry checks |

Undecided choices: the embedding provider and the PDF/OCR service. The current version deliberately stays with lexical retrieval and a user-supplied chat model.

## Requirements and run

- Node.js 24 or newer
- npm
- A modern browser

```bash
npm install
npm run samples      # optional: create synthetic PDFs in samples/
npm run dev          # API on :3001, Vite on http://localhost:5173
```

Open `http://localhost:5173`.

Inspect the production build:

```bash
npm run build
npm start
```

Run the tests:

```bash
npm test
```

No API key is stored in this repository. To run AI features, open **Select Model 鈫?Import Model**, enter an OpenAI-compatible Base URL and your own key, then create a course and upload a text-based PDF. The key is encrypted on the server; `.env`, `.secrets/`, `data/` and `uploads/` are gitignored.

## What to try

- Upload `samples/neural-networks/` and inspect the three-level outline.
- Ask "What are the main knowledge points in this PPT?" to exercise the outline tools.
- Ask a content question to exercise chunk search.
- Ask a follow-up such as "What are its limitations?" to exercise memory.
- Open a source card and check that the original PDF page opens.
- Use **Regenerate outline 鈫?AI** to replace an outline, or choose local mode.

## Development record

- **Initial runnable MVP** 鈥?React/Express/SQLite workspace, PDF queue, page-level extraction, model import with encrypted keys, bilingual UI and tests. Commit [4c57b00](https://github.com/Light4230/CourseAtlas/commit/4c57b00).
- **Interaction and README clarity** 鈥?fixed the outline arrow formatting and documented the runnable scope. Commit [840ea7a](https://github.com/Light4230/CourseAtlas/commit/840ea7a).
- **Development record** 鈥?added the status, checks and AI-assistance record used by the report. Commit [61a6dc1](https://github.com/Light4230/CourseAtlas/commit/61a6dc1).
- Replaced the first page-level outline with a three-level AI outline after real-courseware feedback showed it was too granular; retained a labelled local fallback.
- Added bilingual summaries, original-PDF page links and the outline editor.
- Added bounded model-selected read-only tools, recent/summary memory and tool traces after generic and Chinese queries returned no evidence.
- Fixed an empty-answer failure caused by DeepSeek reasoning tokens consuming the completion budget; final answers now disable thinking and retry once on empty content.
- Verified with TypeScript, 16 automated tests, a production build and headless Edge checks.

## AI assistance

I used a DeepSeek Harness coding agent with the `deepseek-flash` model during development. I asked it to help with code scaffolding, test suggestions, bilingual copy and documentation drafts.

Examples of how I used and changed its output:

- It proposed a bounded read-only tool loop. I kept five tools, removed any write access, capped the loop at three rounds and checked the resulting traces against the API tests.
- It drafted bilingual labels and summary prompts. I shortened labels that did not fit the three-column layout and checked both interface languages in headless Edge.
- It suggested outline schema fields. I removed fields the UI did not use, added page validation and tested the 92-page deck that had previously failed validation.
- It drafted report and README structure. I rewrote the report around the literature problem and removed generic disclaimers and assignment meta-commentary.

I checked the result with TypeScript, Vitest/Supertest, a production build, headless Edge runs and real 23- and 92-page PDF decks. AI was not used to fabricate citations, user-test results or evaluation metrics.

## Limitations

The evaluation is technical: automated tests, a production build and real course decks. AI outline quality was checked on a small set; chat answer quality and live Tavily search were not systematically evaluated. Retrieval is lexical, with a translation fallback for Chinese queries; paraphrase-heavy questions would benefit from embeddings. The AI outline path is capped at 150 pages.

