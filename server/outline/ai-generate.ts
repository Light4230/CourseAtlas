import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import type { ExtractedPage } from '../pdf/extract.js';
import type { SourceRef } from '../types.js';
import type { KeyStore } from '../security/key-store.js';
import type { ModelWithSecret } from '../services/model-service.js';
import { callChatCompletion } from '../services/llm-service.js';
import { extractKeywords } from './generate.js';

const MAX_PAGES_FOR_AI_OUTLINE = 150;

const PageListSchema = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item))
      : [],
  z.array(z.number().int()),
);
const KeywordListSchema = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => String(item)).filter(Boolean)
      : [],
  z.array(z.string().max(80)),
);
const PointSchema = z.object({
  title: z.string().min(2).max(300),
  summaryEn: z.string().min(1).max(2000),
  summaryZh: z.string().min(1).max(2000),
  keywords: KeywordListSchema.optional(),
  sourcePages: PageListSchema,
});
const SectionSchema = z.object({
  title: z.string().min(2).max(300),
  summaryEn: z.string().min(1).max(2000),
  summaryZh: z.string().min(1).max(2000),
  sourcePages: PageListSchema,
  points: z.array(PointSchema),
});
const ChapterSchema = z.object({
  title: z.string().min(2).max(300),
  summaryEn: z.string().min(1).max(2000),
  summaryZh: z.string().min(1).max(2000),
  sourcePages: PageListSchema,
  sections: z.array(SectionSchema),
});
const AiOutlineSchema = z.object({
  chapters: z.array(ChapterSchema),
});

export interface AiOutlinePoint {
  title: string;
  summaryEn: string;
  summaryZh: string;
  keywords: string[];
  sourceRefs: SourceRef[];
}

export interface AiOutlineSection extends AiOutlinePoint {
  points: AiOutlinePoint[];
}

export interface AiOutlineChapter extends AiOutlinePoint {
  sections: AiOutlineSection[];
}

export interface AiOutlineResult {
  chapters: AiOutlineChapter[];
}

export async function generateAiOutline(
  pages: ExtractedPage[],
  documentId: string,
  filename: string,
  model: ModelWithSecret,
  keyStore: KeyStore,
): Promise<AiOutlineResult> {
  if (pages.length > MAX_PAGES_FOR_AI_OUTLINE) {
    throw new ApiError(
      422,
      'OUTLINE_FAILED',
      `AI outlining is limited to ${MAX_PAGES_FOR_AI_OUTLINE} pages per PDF. Use the local fallback for larger files.`,
    );
  }

  const pageBlock = pages
    .map((page) => {
      const text = page.text.replace(/\s+/g, ' ').trim().slice(0, 1800);
      return `[[PAGE ${page.page}]]\n${text}`;
    })
    .join('\n\n');

  const system = [
    'You design revision outlines for university lecture PDFs.',
    'Return ONLY valid JSON. Do not use markdown fences or commentary.',
    'Build a three-level outline: chapters, sections, and knowledge points.',
    'A chapter is a major conceptual area, not a slide. A section is a meaningful sub-area. A point is one reviewable idea.',
    'Combine related slides. Never create one node per slide. Ignore cover, administrative, and reference-list slides.',
    'Do not copy slide text into summaries. Write concise explanations in your own words.',
    'Titles and keywords must be English. Every node must include English and Chinese summaries.',
    'sourcePages must be actual integer page numbers from the supplied pages. Never invent pages.',
    'JSON shape:',
    '{"chapters":[{"title":"...","summaryEn":"...","summaryZh":"...","sourcePages":[1,2],"sections":[{"title":"...","summaryEn":"...","summaryZh":"...","sourcePages":[3],"points":[{"title":"...","summaryEn":"...","summaryZh":"...","keywords":["..."],"sourcePages":[4,5]}]}]}]}',
    'Aim for 3-6 chapters, 2-4 sections per chapter, and 1-3 points per section. Keep the whole outline under 40 points.',
    'English summaries: 25-60 words. Chinese summaries: natural Chinese, 50-120 characters. Preserve technical terms in English where useful.',
  ].join('\n');

  const user = [
    `Lecture file: ${filename}`,
    `Page count: ${pages.length}`,
    'Create a review outline from the page-tagged text below.',
    'Pages:',
    pageBlock,
  ].join('\n\n');

  let raw: string;
  try {
    raw = await callChatCompletion(
      model,
      keyStore,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        temperature: 0.2,
        maxTokens: 12000,
        timeoutMs: 180_000,
        jsonMode: true,
        disableThinking: true,
      },
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'OUTLINE_FAILED', 'The AI outline request failed.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new ApiError(502, 'OUTLINE_FAILED', 'The AI outline was not valid JSON.');
  }
  const validated = AiOutlineSchema.safeParse(parsed);
  if (!validated.success) {
    console.error(
      '[courseatlas] AI outline schema issues:',
      JSON.stringify(validated.error.issues.slice(0, 8)).slice(0, 1200),
    );
    throw new ApiError(502, 'OUTLINE_FAILED', 'The AI outline did not match the required structure.');
  }

  const pagesByNumber = new Map(pages.map((page) => [page.page, page]));
  const chapters: AiOutlineChapter[] = [];

  for (const rawChapter of validated.data.chapters.slice(0, 6)) {
    const chapterPages = validPages(rawChapter.sourcePages, pagesByNumber);
    const sections: AiOutlineSection[] = [];

    for (const rawSection of rawChapter.sections.slice(0, 4)) {
      const sectionPages = validPages(rawSection.sourcePages, pagesByNumber);
      const points: AiOutlinePoint[] = [];

      for (const rawPoint of rawSection.points.slice(0, 3)) {
        const pointPages = validPages(rawPoint.sourcePages, pagesByNumber);
        if (pointPages.length === 0) continue;
        const text = pointPages
          .map((page) => pagesByNumber.get(page)?.text ?? '')
          .join('\n');
        points.push({
          title: cleanTitle(rawPoint.title),
          summaryEn: cleanSummary(rawPoint.summaryEn),
          summaryZh: cleanSummary(rawPoint.summaryZh),
          keywords: cleanKeywords(rawPoint.keywords, rawPoint.title, text),
          sourceRefs: makeSourceRefs(pointPages, documentId, filename, pagesByNumber),
        });
      }

      if (points.length === 0) continue;
      const sectionText = sectionPages
        .map((page) => pagesByNumber.get(page)?.text ?? '')
        .join('\n');
      const resolvedSectionPages = sectionPages.length > 0
        ? sectionPages
        : [...new Set(points.flatMap((point) => point.sourceRefs.map((ref) => ref.page)))];
      sections.push({
        title: cleanTitle(rawSection.title),
        summaryEn: cleanSummary(rawSection.summaryEn),
        summaryZh: cleanSummary(rawSection.summaryZh),
        keywords: cleanKeywords(undefined, rawSection.title, sectionText),
        sourceRefs: makeSourceRefs(resolvedSectionPages, documentId, filename, pagesByNumber),
        points,
      });
    }

    if (sections.length === 0) continue;
    const resolvedChapterPages = chapterPages.length > 0
      ? chapterPages
      : [...new Set(sections.flatMap((section) => section.sourceRefs.map((ref) => ref.page)))];
    chapters.push({
      title: cleanTitle(rawChapter.title),
      summaryEn: cleanSummary(rawChapter.summaryEn),
      summaryZh: cleanSummary(rawChapter.summaryZh),
      keywords: cleanKeywords(undefined, rawChapter.title, ''),
      sourceRefs: makeSourceRefs(resolvedChapterPages, documentId, filename, pagesByNumber),
      sections,
    });
  }

  if (chapters.length === 0) {
    throw new ApiError(502, 'OUTLINE_FAILED', 'The AI outline contained no usable chapters.');
  }
  return { chapters: chapters.slice(0, 6) };
}

function validPages(values: number[], pagesByNumber: Map<number, ExtractedPage>): number[] {
  return [...new Set(values.filter((page) => pagesByNumber.has(page)))].slice(0, 6);
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanSummary(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

function cleanKeywords(
  values: string[] | undefined,
  title: string,
  text: string,
): string[] {
  const fromModel = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  if (fromModel.length >= 3) return [...new Set(fromModel)];
  return extractKeywords(`${title} ${text}`, 6);
}

function makeSourceRefs(
  pageNumbers: number[],
  documentId: string,
  filename: string,
  pagesByNumber: Map<number, ExtractedPage>,
): SourceRef[] {
  return pageNumbers
    .slice(0, 3)
    .map((page) => ({
      documentId,
      filename,
      page,
      quote: readableQuote(pagesByNumber.get(page)?.text ?? ''),
    }))
    .filter((ref) => ref.quote.length > 0);
}

function readableQuote(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[•·\-–—]\s*/, '').trim())
    .filter((line) => line.length >= 25)
    .filter((line) => {
      const letters = (line.match(/[A-Za-z]/g) ?? []).length;
      return letters / Math.max(1, line.length) >= 0.45;
    });
  const candidate = lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
  if (candidate) return candidate.slice(0, 300);
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function extractJson(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}
