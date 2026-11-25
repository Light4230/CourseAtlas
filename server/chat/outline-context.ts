import type { OutlineLecture, RetrievalChunk } from '../types.js';

export interface OutlineContext {
  digest: string;
  chunks: RetrievalChunk[];
}

/**
 * A broad question about "this PPT" or "the course" has no useful BM25 terms
 * (and may be in Chinese against English slides). Answer these from the
 * already-generated outline instead of pretending retrieval found nothing.
 */
export function isOverviewQuestion(question: string): boolean {
  const value = question.toLowerCase();
  const mentionsMaterial =
    /(ppt|课件|幻灯片|讲义|课程|讲次|lecture|slides?|course|week\s*\d+|第[一二三四五六七八九十\d]+(?:节|周|讲|课))/.test(
      value,
    );
  const asksOverview =
    /(主要|讲了|讲什么|讲了什么|哪些|什么内容|内容|知识点|总结|概述|概括|介绍|overview|summar|cover|about|main|key points|topics?)/.test(
      value,
    );
  return mentionsMaterial && asksOverview;
}

export function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

/**
 * Convert the outline into a compact, citable context. Source cards are built
 * from the outline's own page references, so every shown page still maps to an
 * actual PDF page rather than a synthetic excerpt.
 */
export function buildOutlineContext(
  lectures: OutlineLecture[],
  lectureId: string | undefined,
  chinese: boolean,
): OutlineContext | null {
  const selected = lectureId ? lectures.filter((lecture) => lecture.id === lectureId) : lectures;
  const usable = selected.filter(
    (lecture) => lecture.document.status === 'ready' && lecture.topics.length > 0,
  );
  if (usable.length === 0) return null;

  const lines: string[] = [];
  const chunks: RetrievalChunk[] = [];
  const seenPages = new Set<string>();
  let topicCount = 0;
  const maxTopics = 140;

  for (const lecture of usable) {
    const pageText =
      lecture.document.pageCount === null ? 'page count unknown' : `${lecture.document.pageCount} pages`;
    lines.push(`Lecture: ${lecture.title} (${lecture.document.filename}, ${pageText})`);
    const roots = lecture.topics.filter((topic) => topic.parentId === null);
    const sourceTopics = roots.length > 0 ? roots : lecture.topics;

    for (const topic of sourceTopics) {
      const ref = topic.sourceRefs[0];
      if (!ref) continue;
      const key = `${ref.documentId}:${ref.page}`;
      if (seenPages.has(key)) continue;
      seenPages.add(key);
      chunks.push({
        chunkId: `outline:${topic.id}`,
        documentId: ref.documentId,
        lectureId: lecture.id,
        filename: ref.filename,
        lectureTitle: lecture.title,
        page: ref.page,
        text: ref.quote || topic.summaryEn || topic.summaryZh,
        quote: ref.quote || topic.summaryEn || topic.summaryZh,
        score: 1,
      });
      if (chunks.length >= 8) break;
    }

    for (const topic of lecture.topics) {
      if (topicCount >= maxTopics) break;
      const summary = (chinese ? topic.summaryZh : topic.summaryEn) || topic.summaryZh || topic.summaryEn;
      const ref = topic.sourceRefs[0];
      const page = ref ? ` [${ref.filename} p.${ref.page}]` : '';
      lines.push(
        `${'  '.repeat(Math.min(topic.level, 3))}${topic.number} ${topic.title}${page} — ${summary
          .replace(/\s+/g, ' ')
          .slice(0, 320)}`,
      );
      topicCount += 1;
    }
    if (topicCount >= maxTopics) lines.push('(additional topics omitted for length)');
  }

  return { digest: lines.join('\n'), chunks };
}
