import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { RetrievalChunk } from '../types.js';
import type { KeyStore } from '../security/key-store.js';
import type { ModelWithSecret } from '../services/model-service.js';
import { callChatCompletion } from '../services/llm-service.js';
import { getOutline } from '../services/outline-service.js';
import type { ConversationMemory } from './memory.js';
import { memoryPromptBlock } from './memory.js';
import {
  MAX_TOOL_ROUNDS,
  TOOL_DEFINITIONS,
  executeTool,
  toolCallKey,
  type ChatToolCall,
  type ChatToolTrace,
  type ChatToolName,
  type ToolContext,
} from './tools.js';
import { hasCjk } from './outline-context.js';

const PlannerSchema = z
  .object({
    done: z.boolean().optional(),
    tool: z
      .enum(['get_course_catalog', 'get_lecture_outline', 'search_chunks', 'read_pages', 'get_topic'])
      .optional(),
    arguments: z.record(z.unknown()).optional(),
  })
  .refine((value) => value.done === true || value.tool !== undefined, {
    message: 'Provide done or tool.',
  });

export interface ToolLoopResult {
  calls: ChatToolTrace[];
  evidence: string;
  chunks: RetrievalChunk[];
  confidence: number;
}

export interface ToolLoopInput {
  db: DatabaseSync;
  courseId: string;
  currentLectureId?: string;
  currentTopicId?: string;
  question: string;
  memory: ConversationMemory;
  minConfidence: number;
}

export async function runToolLoop(
  input: ToolLoopInput,
  model: ModelWithSecret,
  keyStore: KeyStore,
): Promise<ToolLoopResult> {
  const context: ToolContext = {
    db: input.db,
    courseId: input.courseId,
    currentLectureId: input.currentLectureId,
    currentTopicId: input.currentTopicId,
    preferChinese: hasCjk(input.question),
    minConfidence: input.minConfidence,
  };
  const catalog = buildCatalog(input.db, input.courseId, input.currentLectureId);
  const calls: ChatToolTrace[] = [];
  const chunks: RetrievalChunk[] = [];
  const seenCalls = new Set<string>();
  const evidenceParts: string[] = [];
  let confidence = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let plan: z.infer<typeof PlannerSchema> | null;
    try {
      plan = await planNextTool(
        model,
        keyStore,
        catalog,
        input.question,
        input.memory,
        evidenceParts,
        input.currentLectureId,
      );
    } catch {
      break;
    }
    if (!plan || plan.done || !plan.tool) break;

    const call: ChatToolCall = {
      name: plan.tool as ChatToolName,
      arguments: plan.arguments ?? {},
    };
    const key = toolCallKey(call);
    if (seenCalls.has(key)) break;
    seenCalls.add(key);

    const result = await executeTool(context, call);
    calls.push({ ...call, ok: result.ok, summary: result.summary });
    confidence = Math.max(confidence, result.confidence);
    if (result.evidence) evidenceParts.push(result.evidence);
    for (const chunk of result.chunks) {
      if (!chunks.some((existing) => existing.chunkId === chunk.chunkId)) chunks.push(chunk);
    }
    if (!result.ok && result.summary.includes('No course chunks matched')) {
      // Let the planner decide whether to broaden the query or stop.
      continue;
    }
    if (result.ok && (result.evidence || result.chunks.length > 0)) continue;
  }

  return {
    calls,
    evidence: cap(evidenceParts.join('\n\n'), 9_000),
    chunks: chunks.slice(0, 8),
    confidence,
  };
}

async function planNextTool(
  model: ModelWithSecret,
  keyStore: KeyStore,
  catalog: string,
  question: string,
  memory: ConversationMemory,
  evidenceParts: string[],
  currentLectureId?: string,
): Promise<z.infer<typeof PlannerSchema> | null> {
  const memoryText = memoryPromptBlock(memory);
  const toolResults = evidenceParts.length
    ? evidenceParts.map((part, index) => `--- Tool result ${index + 1} ---\n${part}`).join('\n\n')
    : 'None yet.';
  const content = await callChatCompletion(
    model,
    keyStore,
    [
      {
        role: 'system',
        content:
          'You are the retrieval planner for CourseAtlas, a course-study assistant. ' +
          'You must decide which read-only course tool to call next. Do not answer the user question yet. ' +
          'Return ONLY JSON in one of these forms:\n' +
          '{"tool":"get_course_catalog","arguments":{}}\n' +
          '{"tool":"get_lecture_outline","arguments":{"lectureId":"uuid"}}\n' +
          '{"tool":"search_chunks","arguments":{"query":"English search terms","lectureId":"uuid optional","topK":5}}\n' +
          '{"tool":"read_pages","arguments":{"documentId":"uuid","page":3,"before":1,"after":1}}\n' +
          '{"tool":"get_topic","arguments":{"topicId":"uuid"}}\n' +
          '{"done":true}\n\n' +
          'Rules: choose at most one tool per turn; use English search terms for English slides; ' +
          'use get_lecture_outline for overviews such as "what does this PPT cover"; ' +
          'use search_chunks for concepts and details; use read_pages for a specific page/formula; ' +
          'use get_topic for the selected knowledge point; ' +
          'stop with done when the evidence is enough or no tool will help. ' +
          'Course catalog:\n' +
          catalog +
          '\n\n' +
          TOOL_DEFINITIONS,
      },
      {
        role: 'user',
        content:
          (memoryText ? `Conversation memory:\n${memoryText}\n\n` : '') +
          `Current lecture: ${currentLectureId ?? 'none selected (use the catalog)'}\n` +
          `Question: ${question}\n\nTool results already collected:\n${toolResults}`,
      },
    ],
    { temperature: 0, maxTokens: 500, timeoutMs: 25_000, jsonMode: true, disableThinking: true },
  );

  const parsed = parseJsonObject(content);
  if (!parsed) return null;
  const validated = PlannerSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
}

function buildCatalog(db: DatabaseSync, courseId: string, currentLectureId?: string): string {
  const outline = getOutline(db, courseId);
  const catalog = outline.lectures.map((lecture) => ({
    id: lecture.id,
    documentId: lecture.documentId,
    title: lecture.title,
    current: lecture.id === currentLectureId,
    filename: lecture.document.filename,
    pageCount: lecture.document.pageCount,
    chapters: lecture.topics
      .filter((topic) => topic.kind === 'chapter' || topic.parentId === null)
      .slice(0, 8)
      .map((topic) => ({
        id: topic.id,
        number: topic.number,
        title: topic.title,
        page: topic.sourceRefs[0]?.page ?? null,
      })),
  }));
  return JSON.stringify(catalog, null, 2).slice(0, 8_000);
}

function parseJsonObject(content: string): unknown | null {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function cap(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
