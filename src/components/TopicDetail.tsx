import { useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Highlighter,
  Layers3,
  Merge,
  Pencil,
  Quote,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Lecture, SourceRef, Topic } from '../types';
import { localizedSummary } from '../lib/format';
import { findTopicNode, topicAncestors } from '../lib/outline';

interface FocusSource {
  documentId: string;
  page: number;
  nonce: number;
}

interface TopicDetailProps {
  topic: Topic | null;
  lecture: Lecture | null;
  siblings: Topic[];
  language: string;
  focusSource: FocusSource | null;
  onSelectTopic: (topicId: string) => void;
  onEdit: (topic: Topic) => void;
  onMerge: (topic: Topic) => void;
  onSplit: (topic: Topic) => void;
}

export function TopicDetail({
  topic,
  lecture,
  siblings,
  language,
  focusSource,
  onSelectTopic,
  onEdit,
  onMerge,
  onSplit,
}: TopicDetailProps) {
  const { t } = useTranslation();
  const sourceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const index = topic ? siblings.findIndex((item) => item.id === topic.id) : -1;
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const node = topic && lecture ? findTopicNode(lecture.topics, topic.id) : null;
  const children = node?.children ?? [];
  const ancestors = topic && lecture ? topicAncestors(lecture.topics, topic.id) : [];
  const summary = topic ? localizedSummary(topic, language) : '';
  const highlightTerms = useMemo(() => {
    if (!topic) return [];
    return [...topic.keywords, ...topic.title.split(/\s+/)]
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length >= 3)
      .filter((term, position, list) => list.indexOf(term) === position)
      .sort((a, b) => b.length - a.length)
      .slice(0, 14);
  }, [topic]);

  useEffect(() => {
    if (!focusSource) return;
    const key = `${focusSource.documentId}:${focusSource.page}`;
    const timer = window.setTimeout(() => {
      sourceRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusSource?.nonce, topic?.id]);

  if (!topic || !lecture) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700/10 text-teal-800">
          <BookOpen size={26} strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-xl font-semibold text-ink">{t('topic.selectTitle')}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{t('topic.selectBody')}</p>
      </div>
    );
  }

  const isPoint = topic.kind === 'point';
  const kindLabel =
    topic.kind === 'chapter'
      ? t('topic.chapter')
      : topic.kind === 'section'
        ? t('topic.section')
        : t('topic.knowledgePoint');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
            <span className="font-semibold text-teal-800">{lecture.title}</span>
            {ancestors.map((ancestor) => (
              <span key={ancestor.id} className="flex items-center gap-1.5">
                <span>/</span>
                <button
                  type="button"
                  className="max-w-[10rem] truncate hover:text-teal-800"
                  onClick={() => onSelectTopic(ancestor.id)}
                >
                  {ancestor.number} {ancestor.title}
                </button>
              </span>
            ))}
            <span>/</span>
            <span className="font-mono">{topic.number}</span>
            <span>/</span>
            <span>{kindLabel}</span>
          </div>
          <h2 className="text-balance font-display text-[26px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[30px]">
            {topic.title}
          </h2>
          <p className="mt-1.5 max-w-xl text-[11.5px] text-muted">
            {t('topic.detailMeta', {
              lecture: lecture.title,
              filename: lecture.document.filename,
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {previous ? (
            <button
              type="button"
              className="btn-secondary h-8 px-2.5"
              onClick={() => onSelectTopic(previous.id)}
              title={t('topic.prevTopic')}
              aria-label={t('topic.prevTopic')}
            >
              <ChevronLeft size={14} />
            </button>
          ) : null}
          {next ? (
            <button
              type="button"
              className="btn-secondary h-8 px-2.5"
              onClick={() => onSelectTopic(next.id)}
              title={t('topic.nextTopic')}
              aria-label={t('topic.nextTopic')}
            >
              <ChevronRight size={14} />
            </button>
          ) : null}
          <button type="button" className="btn-secondary h-8 px-2.5" onClick={() => onEdit(topic)}>
            <Pencil size={13} />
            {t('common.edit')}
          </button>
          {isPoint ? (
            <>
              <button
                type="button"
                className="btn-secondary h-8 px-2.5"
                onClick={() => onMerge(topic)}
                disabled={!next}
                title={t('outline.merge')}
              >
                <Merge size={13} />
                <span className="hidden sm:inline">{t('outline.merge')}</span>
              </button>
              <button
                type="button"
                className="btn-secondary h-8 px-2.5"
                onClick={() => onSplit(topic)}
                disabled={topic.sourceRefs.length < 2}
                title={t('outline.split')}
              >
                <Scissors size={13} />
                <span className="hidden sm:inline">{t('outline.split')}</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span
          className={`badge ${topic.manuallyEdited ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800'}`}
        >
          {topic.manuallyEdited ? t('badges.edited') : t('badges.auto')}
        </span>
        <span className="chip">
          {topic.kind === 'chapter' ? (
            <BookOpen size={10} />
          ) : topic.kind === 'section' ? (
            <Layers3 size={10} />
          ) : (
            <Sparkles size={10} />
          )}
          {kindLabel}
        </span>
        {lecture.generationMethod === 'ai' ? (
          <span className="chip gap-1">
            <Sparkles size={10} className="text-model" />
            {t('outline.aiGeneratedBy', {
              model: lecture.outlineModelName || t('common.unknown'),
            })}
          </span>
        ) : (
          <span className="chip">{t('outline.localOutline')}</span>
        )}
      </div>

      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/70 bg-white/45 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <BookOpen size={13} className="text-teal-800" />
            <h3 className="section-label">{t('topic.summary')}</h3>
          </div>
          <span className="text-[10px] text-muted">{topic.number}</span>
        </div>
        <div className="px-4 py-4">
          <p className={`text-[14px] leading-7 ${summary ? 'text-ink/90' : 'italic text-muted'}`}>
            {summary || t('topic.noSummary')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Highlighter size={11} className="text-muted" />
            {topic.keywords.length > 0 ? (
              topic.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-md border border-line/80 bg-parchment/50 px-2 py-1 text-[10.5px] font-medium text-ink/75"
                >
                  {keyword}
                </span>
              ))
            ) : (
              <span className="text-[10.5px] text-muted">{t('topic.noKeywords')}</span>
            )}
          </div>
          {topic.kind !== 'point' ? (
            <p className="mt-3 text-[10px] text-muted">
              {t('topic.containsChildren', { count: children.length })}
            </p>
          ) : null}
        </div>
      </section>

      {children.length > 0 ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Layers3 size={13} className="text-teal-800" />
            <h3 className="section-label">{t('topic.children')}</h3>
          </div>
          <div className="space-y-1.5">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelectTopic(child.id)}
                className="card flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:border-teal-700/30 hover:bg-white"
              >
                <span className="mt-0.5 shrink-0 rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-teal-800">
                  {child.number}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-ink">{child.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4 text-muted">
                    {localizedSummary(child, language) || t('topic.noSummary')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Quote size={13} className="text-teal-800" />
            <h3 className="section-label">{t('topic.sources')}</h3>
            <span className="rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[9.5px] font-bold text-muted">
              {topic.sourceRefs.length}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted">
            <Highlighter size={10} />
            {t('topic.highlightHint')}
          </span>
        </div>

        <div className="space-y-2.5">
          {topic.sourceRefs.map((ref) => {
            const key = `${ref.documentId}:${ref.page}`;
            return (
              <SourceCard
                key={`${key}-${ref.quote.slice(0, 12)}`}
                sourceRef={ref}
                highlightTerms={highlightTerms}
                refCallback={(element) => {
                  sourceRefs.current[key] = element;
                }}
              />
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-muted">{t('topic.sourceCaveat')}</p>
      </section>
    </div>
  );
}

function SourceCard({
  sourceRef,
  highlightTerms,
  refCallback,
}: {
  sourceRef: SourceRef;
  highlightTerms: string[];
  refCallback: (element: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  const href = `/api/documents/${sourceRef.documentId}/file#page=${sourceRef.page}`;
  return (
    <div ref={refCallback} className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700/10 text-teal-800">
            <FileText size={13} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11.5px] font-semibold text-ink">
              {sourceRef.filename}
            </span>
            <span className="mt-0.5 block text-[10px] font-medium text-muted">
              {t('topic.page', { page: sourceRef.page })}
            </span>
          </span>
        </div>
        <a
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[10px] font-semibold text-teal-800 transition hover:border-teal-700/40 hover:bg-teal-50"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('topic.openPdf')}
          <ExternalLink size={11} />
        </a>
      </div>
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          {t('topic.excerpt')}
        </p>
        <p className="source-quote mt-1 line-clamp-3 text-[12px] leading-6 text-ink/75">
          <HighlightedText text={sourceRef.quote} terms={highlightTerms} />
        </p>
        <p className="mt-2 text-[9.5px] text-muted">{t('topic.pdfHint')}</p>
      </div>
    </div>
  );
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
