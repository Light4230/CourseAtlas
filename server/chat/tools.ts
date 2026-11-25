import type { DatabaseSync } from 'node:sqlite';
import type { OutlineLecture, RetrievalChunk } from '../types.js';
import { getOutline, getTopic } from '../services/outline-service.js';
import { retrieveChunks } from '../retrieval/bm25.js';
import { buildOutlineContext, hasCjk } from './outline-context.js';

export type ChatToolName =
  | 'get_course_catalog'
  | 'get_lecture_outline'
  | 'search_chunks'
  | 'read_pages'
  | 'get_topic';

export interface ChatToolCall {
  name: ChatToolName;
  arguments: Record<string, unknown>;
}

export interface ChatToolTrace extends ChatToolCall {
  ok: boolean;
  summary: string;
}

export interface ChatToolResult {
  ok: boolean;
  summary: string;
  evidence: string;
  chunks: RetrievalChunk[];
  confidence: number;
}

export interface ToolContext {
  db: DatabaseSync;
  courseId: string;
  currentLectureId?: string;
  currentTopicId?: string;
  preferChinese: boolean;
  minConfidence: number;
}

export const TOOL_DEFINITIONS = `
Available read-only tools:
1. get_course_catalog()
   Return lectures (id, title, filename, page count) and their top-level chapter titles.

2. get_lecture_outline({ "lectureId": "uuid" })
   Return the three-level outline (chapter, section, point), summaries, and page references for one lecture.
   Use this for "what does this PPT cover", "summarise this lecture", or "which knowledge points".

3. search_chunks({ "query": "English search terms", "lectureId": "uuid optional", "topK": 5 })
   BM25 search over actual PDF chunks. Use English terms for English slides.
   Use this for concepts, definitions, formulas, explanations, and comparisons.

4. read_pages({ "documentId": "uuid", "page": 3, "before": 1, "after": 1 })
   Read the actual extracted text on a specific PDF page and its neighbours.
   Use this for "page 3", "this formula", "the diagram on this slide".

5. get_topic({ "topicId": "uuid" })
   Return one topic's summary, keywords, source pages, and child topics.
   Use this for a selected knowledge point.
`.trim();

const MAX_TOOL_ROUNDS = 3;
export { MAX_TOOL_ROUNDS };

export function toolCallKey(call: ChatToolCall): string {
  return `${call.name}:${JSON.stringify(call.arguments)}`;
}

export async function executeTool(
  context: ToolContext,
  call: ChatToolCall,
): Promise<ChatToolResult> {
  try {
    switch (call.name) {
      case 'get_course_catalog':
        return getCourseCatalog(context);
      case 'get_lecture_outline':
        return getLectureOutline(context, call.arguments);
      case 'search_chunks':
        return searchChunks(context, call.arguments);
      case 'read_pages':
        return readPages(context, call.arguments);
      case 'get_topic':
        return getTopicTool(context, call.arguments);
      default:
        return fail('Unknown tool.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool failed.';
    return fail(message.slice(0, 300));
  }
}

function getCourseCatalog(context: ToolContext): ChatToolResult {
  const outline = getOutline(context.db, context.courseId);
  const lectures = outline.lectures
    .filter((lecture) => lecture.topics.length > 0)
    .map((lecture) => ({
      id: lecture.id,
      documentId: lecture.documentId,
      title: lecture.title,
      filename: lecture.document.filename,
      pageCount: lecture.document.pageCount,
      chapters: lecture.topics
        .filter((topic) => topic.kind === 'chapter' || topic.parentId === null)
        .slice(0, 10)
        .map((topic) => ({
          number: topic.number,
          title: topic.title,
          page: topic.sourceRefs[0]?.page ?? null,
        })),
    }));
  return {
    ok: true,
    summary: `Course has ${lectures.length} lecture(s) with outlines.`,
    evidence: `Course catalog:\n${JSON.stringify(lectures, null, 2)}`,
    chunks: [],
    confidence: 0,
  };
}

function getLectureOutline(
  context: ToolContext,
  args: Record<string, unknown>,
): ChatToolResult {
  const outline = getOutline(context.db, context.courseId);
  let lectureId = optionalString(args.lectureId);
  if (!lectureId && context.currentLectureId) lectureId = context.currentLectureId;
  if (!lectureId && outline.lectures.length === 1) lectureId = outline.lectures[0]?.id;
  if (!lectureId) {
    return fail('lectureId is required when the course has more than one lecture.');
  }
  const lecture = outline.lectures.find((item) => item.id === lectureId);
  if (!lecture) return fail('Lecture not found in this course.');
  return outlineResult([lecture], context.preferChinese);
}

function outlineResult(lectures: OutlineLecture[], chinese: boolean): ChatToolResult {
  const outline = buildOutlineContext(lectures, undefined, chinese);
  if (!outline || !outline.digest.trim()) {
    return fail('This lecture does not have a generated outline yet.');
  }
  return {
    ok: true,
    summary: `Loaded outline for ${lectures.map((lecture) => lecture.title).join(', ')}.`,
    evidence: `Course outline:\n${outline.digest}`,
    chunks: outline.chunks,
    confidence: 0.98,
  };
}

function searchChunks(context: ToolContext, args: Record<string, unknown>): ChatToolResult {
  const query = requiredString(args.query, 500);
  if (!query) return fail('query is required.');
  const lectureId = optionalString(args.lectureId) ?? context.currentLectureId;
  if (lectureId) {
    const exists = context.db
      .prepare('SELECT id FROM lectures WHERE id = ? AND course_id = ?')
      .get(lectureId, context.courseId);
    if (!exists) return fail('lectureId does not belong to this course.');
  }
  const topK = clamp(optionalNumber(args.topK) ?? 5, 1, 8);
  const retrieval = retrieveChunks(context.db, context.courseId, query, topK, lectureId);
  if (retrieval.chunks.length === 0 || retrieval.confidence < context.minConfidence) {
    return {
      ok: false,
      summary:
        retrieval.chunks.length === 0
          ? 'No course chunks matched. Try broader English keywords.'
          : `Matches are below the evidence threshold (${retrieval.confidence} < ${context.minConfidence}). Try different terms.`,
      evidence: '',
      chunks: [],
      confidence: retrieval.confidence,
    };
  }
  const evidence = retrieval.chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.filename} p.${chunk.page} (${chunk.lectureTitle})\n${chunk.text.slice(0, 1200)}`,
    )
    .join('\n\n');
  return {
    ok: true,
    summary: `Found ${retrieval.chunks.length} chunk(s); confidence ${retrieval.confidence}.`,
    evidence: `Course excerpts:\n${evidence}`,
    chunks: retrieval.chunks,
    confidence: retrieval.confidence,
  };
}

function readPages(context: ToolContext, args: Record<string, unknown>): ChatToolResult {
  const documentId = requiredString(args.documentId, 80);
  const page = Math.trunc(optionalNumber(args.page) ?? 0);
  if (!documentId || page < 1) return fail('documentId and a positive page are required.');
  const before = clamp(Math.trunc(optionalNumber(args.before) ?? 0), 0, 2);
  const after = clamp(Math.trunc(optionalNumber(args.after) ?? 0), 0, 2);
  const document = context.db
    .prepare(
      `SELECT d.id, d.filename, d.page_count, l.id AS lecture_id, l.title AS lecture_title
         FROM documents d
         JOIN lectures l ON l.document_id = d.id
        WHERE d.id = ? AND d.course_id = ?`,
    )
    .get(documentId, context.courseId) as Record<string, unknown> | undefined;
  if (!document) return fail('Document not found in this course.');
  const pageCount = Number(document.page_count ?? 0);
  if (pageCount > 0 && page > pageCount) return fail('Page is outside this document.');
  const from = Math.max(1, page - before);
  const to = pageCount > 0 ? Math.min(pageCount, page + after) : page + after;
  const rows = context.db
    .prepare(
      `SELECT c.id, c.document_id, c.lecture_id, c.page, c.text,
              d.filename, l.title AS lecture_title
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN lectures l ON l.id = c.lecture_id
        WHERE c.document_id = ? AND c.course_id = ? AND c.page BETWEEN ? AND ?
        ORDER BY c.page ASC, c.chunk_index ASC
        LIMIT 12`,
    )
    .all(documentId, context.courseId, from, to) as Array<Record<string, unknown>>;
  if (rows.length === 0) return fail('No text chunks on that page.');
  const chunks = rows.map((row) => ({
    chunkId: String(row.id),
    documentId: String(row.document_id),
    lectureId: String(row.lecture_id),
    filename: String(row.filename),
    lectureTitle: String(row.lecture_title),
    page: Number(row.page),
    text: String(row.text),
    quote: String(row.text).slice(0, 300),
    score: 1,
  }));
  return {
    ok: true,
    summary: `Read page ${page}${before || after ? ` with neighbours ${from}-${to}` : ''}.`,
    evidence: `PDF pages ${from}-${to}:\n${chunks
      .map((chunk) => `[${chunk.filename} p.${chunk.page}]\n${chunk.text.slice(0, 1600)}`)
      .join('\n\n')}`,
    chunks,
    confidence: 0.95,
  };
}

function getTopicTool(context: ToolContext, args: Record<string, unknown>): ChatToolResult {
  const topicId = optionalString(args.topicId) ?? context.currentTopicId;
  if (!topicId) return fail('topicId is required.');
  const topic = getTopic(context.db, topicId);
  if (topic.courseId !== context.courseId) return fail('Topic not found in this course.');
  const children = context.db
    .prepare('SELECT id, number, title, summary_en, summary_zh FROM topics WHERE parent_id = ?')
    .all(topicId) as Array<Record<string, unknown>>;
  const summary =
    context.preferChinese
      ? topic.summaryZh || topic.summaryEn || topic.summary
      : topic.summaryEn || topic.summaryZh || topic.summary;
  const refs = topic.sourceRefs
    .slice(0, 4)
    .map((ref) => `[${ref.filename} p.${ref.page}] ${ref.quote}`)
    .join('\n');
  const childText = children
    .map((child) => `- ${String(child.number)} ${String(child.title)}`)
    .join('\n');
  return {
    ok: true,
    summary: `Loaded topic ${topic.number} ${topic.title}.`,
    evidence:
      `Topic: ${topic.number} ${topic.title}\nSummary: ${summary}\n` +
      (childText ? `Children:\n${childText}\n` : '') +
      refs,
    chunks: topic.sourceRefs.slice(0, 4).map((ref, index) => ({
      chunkId: `topic:${topic.id}:${index}`,
      documentId: ref.documentId,
      lectureId: topic.lectureId,
      filename: ref.filename,
      lectureTitle: topic.title,
      page: ref.page,
      text: ref.quote,
      quote: ref.quote,
      score: 1,
    })),
    confidence: 0.95,
  };
}

function fail(summary: string): ChatToolResult {
  return { ok: false, summary, evidence: '', chunks: [], confidence: 0 };
}

function requiredString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isChinese(text: string): boolean {
  return hasCjk(text);
}
