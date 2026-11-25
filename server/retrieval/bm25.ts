import type { DatabaseSync } from 'node:sqlite';
import MiniSearch from 'minisearch';
import type { RetrievalChunk } from '../types.js';
import { makeExcerpt } from '../pdf/chunk.js';

export interface RetrievalResult {
  chunks: RetrievalChunk[];
  confidence: number;
  queryTerms: string[];
  matchedTerms: string[];
  coverage: number;
  bestScore: number;
}

const QUERY_STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'could', 'describe', 'did',
  'do', 'does', 'explain', 'for', 'from', 'give', 'how', 'i', 'in', 'is', 'it', 'lecture', 'me',
  'of', 'on', 'or', 'please', 'summarise', 'summarize', 'tell', 'that', 'the', 'this', 'to',
  'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'work', 'works', 'would',
  'course', 'materials', 'slides', 'according', 'define', 'definition', 'list',
]);

export function retrieveChunks(
  db: DatabaseSync,
  courseId: string,
  query: string,
  topK: number,
  lectureId?: string,
): RetrievalResult {
  const rows = db
    .prepare(
      `SELECT c.id, c.document_id, c.lecture_id, c.page, c.text,
              d.filename, l.title AS lecture_title
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN lectures l ON l.id = c.lecture_id
        WHERE c.course_id = ? ${lectureId ? 'AND c.lecture_id = ?' : ''}
        ORDER BY c.chunk_index ASC`,
    )
    .all(...(lectureId ? [courseId, lectureId] : [courseId])) as Array<Record<string, unknown>>;

  const queryTerms = tokeniseQuery(query);
  if (rows.length === 0 || queryTerms.length === 0) {
    return {
      chunks: [],
      confidence: 0,
      queryTerms,
      matchedTerms: [],
      coverage: 0,
      bestScore: 0,
    };
  }

  const miniSearch = new MiniSearch<Record<string, string>>({
    fields: ['text', 'filename', 'lectureTitle'],
    storeFields: ['id', 'documentId', 'lectureId', 'page', 'text', 'filename', 'lectureTitle'],
    idField: 'id',
    tokenize: (text) => text.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [],
  });
  miniSearch.addAll(
    rows.map((row) => ({
      id: String(row.id),
      documentId: String(row.document_id),
      lectureId: String(row.lecture_id),
      page: String(row.page),
      text: String(row.text),
      filename: String(row.filename),
      lectureTitle: String(row.lecture_title),
    })),
  );

  const results = miniSearch.search(queryTerms.join(' '), {
    boost: { text: 1.4, lectureTitle: 0.8, filename: 0.4 },
    fuzzy: 0.15,
    prefix: true,
    combineWith: 'OR',
  });

  const chunks: RetrievalChunk[] = results.slice(0, topK).map((result) => ({
    chunkId: String(result.id),
    documentId: String(result.documentId),
    lectureId: String(result.lectureId),
    filename: String(result.filename),
    lectureTitle: String(result.lectureTitle),
    page: Number(result.page),
    text: String(result.text),
    quote: makeExcerpt(String(result.text), 300),
    score: Number(Number(result.score).toFixed(4)),
  }));

  const matchedTerms = queryTerms.filter((term) =>
    chunks.slice(0, 3).some((chunk) => {
      const haystack = `${chunk.text} ${chunk.lectureTitle} ${chunk.filename}`.toLowerCase();
      return containsTerm(haystack, term);
    }),
  );
  const coverage = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0;
  const bestScore = results[0]?.score ?? 0;
  const saturation = 1 - Math.exp(-bestScore / 5);
  // A single incidental term in a large corpus can produce a large BM25 score.
  // Weight query coverage more strongly so "world" alone cannot ground an
  // unrelated question as course evidence.
  const confidence = Math.max(
    0,
    Math.min(1, Math.pow(coverage, 0.7) * (0.55 + 0.45 * saturation)),
  );

  return {
    chunks,
    confidence: Number(confidence.toFixed(3)),
    queryTerms,
    matchedTerms,
    coverage: Number(coverage.toFixed(3)),
    bestScore: Number(Number(bestScore).toFixed(4)),
  };
}

export function tokeniseQuery(query: string): string[] {
  const tokens = (query.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? []).filter(
    (token) => !QUERY_STOP_WORDS.has(token) && token.length >= 2,
  );
  return [...new Set(tokens)];
}

function containsTerm(haystack: string, term: string): boolean {
  if (haystack.includes(term)) return true;
  const stem = stemWord(term);
  const words = haystack.match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [];
  return words.some((word) => stemWord(word) === stem);
}

function stemWord(word: string): string {
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
