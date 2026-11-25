import { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers3,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Lecture } from '../types';
import { translateError } from '../lib/format';
import { buildTopicTree, type TopicNode } from '../lib/outline';

interface OutlineTreeProps {
  lectures: Lecture[];
  selectedTopicId: string | null;
  collapsedLectures: Set<string>;
  loading: boolean;
  onToggleLecture: (lectureId: string) => void;
  onSelectTopic: (topicId: string) => void;
  onEditLecture: (lecture: Lecture) => void;
  onRegenerate: (lecture: Lecture) => void;
  onDeleteLecture: (lecture: Lecture) => void;
  onRetryDocument: (lecture: Lecture) => void;
  onRefresh: () => void;
}

export function OutlineTree({
  lectures,
  selectedTopicId,
  collapsedLectures,
  loading,
  onToggleLecture,
  onSelectTopic,
  onEditLecture,
  onRegenerate,
  onDeleteLecture,
  onRetryDocument,
  onRefresh,
}: OutlineTreeProps) {
  const { t } = useTranslation();
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const totalTopics = lectures.reduce((sum, lecture) => sum + lecture.topics.length, 0);

  const toggleNode = (topicId: string) => {
    setCollapsedNodes((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col px-3 pb-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-teal-700" />
          <h2 className="section-label">{t('outline.title')}</h2>
        </div>
        <span className="text-[10px] font-medium text-muted">
          {t('units.lectures', { count: lectures.length })} ·{' '}
          {t('units.topics', { count: totalTopics })}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : lectures.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white/45 px-3 py-5">
            <p className="text-sm font-semibold text-ink">{t('outline.emptyTitle')}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted">{t('outline.emptyBody')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lectures.map((lecture) => {
              const collapsed = collapsedLectures.has(lecture.id);
              const isProcessing = ['queued', 'parsing', 'outlining'].includes(
                lecture.document.status,
              );
              const isFailed = lecture.document.status === 'failed';
              const roots = buildTopicTree(lecture.topics);
              const isAi = lecture.generationMethod === 'ai';
              return (
                <div
                  key={lecture.id}
                  className="overflow-hidden rounded-xl border border-line/80 bg-white/60 shadow-sm"
                >
                  <div className="group flex items-start gap-1.5 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onToggleLecture(lecture.id)}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink/[0.06] hover:text-ink"
                      aria-label={
                        collapsed
                          ? t('outline.expandLecture', { title: lecture.title })
                          : t('outline.collapseLecture', { title: lecture.title })
                      }
                    >
                      {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onToggleLecture(lecture.id)}
                    >
                      <span className="flex items-start gap-1.5">
                        <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-semibold leading-4 text-ink">
                          {lecture.title}
                        </span>
                        {isAi ? (
                          <span className="badge mt-0.5 shrink-0 bg-model/10 text-[8.5px] text-model">
                            {t('outline.aiBadge')}
                          </span>
                        ) : lecture.generationMethod === 'pages' ? (
                          <span className="badge mt-0.5 shrink-0 bg-amber-50 text-[8.5px] text-amber-800">
                            {t('outline.fallbackBadge')}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted">
                        <FileText size={10} className="shrink-0" />
                        <span className="truncate" title={lecture.document.filename}>
                          {lecture.document.filename}
                        </span>
                        {lecture.document.pageCount ? (
                          <span className="shrink-0">
                            · {t('units.pages', { count: lecture.document.pageCount })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button
                        type="button"
                        className="btn-icon h-6 w-6"
                        onClick={() => onEditLecture(lecture)}
                        title={t('outline.editLecture')}
                        aria-label={t('outline.editLecture')}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon h-6 w-6"
                        onClick={() => onRegenerate(lecture)}
                        disabled={isProcessing || isFailed}
                        title={t('outline.regenerate')}
                        aria-label={t('outline.regenerate')}
                      >
                        <RefreshCw size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon h-6 w-6 hover:text-red-700"
                        onClick={() => onDeleteLecture(lecture)}
                        title={t('outline.deleteLecture')}
                        aria-label={t('outline.deleteLecture')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {!collapsed ? (
                    <div className="border-t border-line/60 bg-white/35 px-1.5 pb-1.5 pt-1.5">
                      {isProcessing ? (
                        <div className="flex items-center gap-2 rounded-lg bg-sky-50/80 px-2 py-2 text-[10.5px] text-sky-800">
                          <Loader2 size={12} className="animate-spin" />
                          <span>{t('outline.generatingWithModel')}</span>
                        </div>
                      ) : isFailed ? (
                        <div className="rounded-lg bg-red-50/80 px-2 py-2">
                          <div className="flex items-start gap-1.5 text-[10.5px] leading-4 text-red-800">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            <span>
                              {translateError(t, lecture.document.errorCode)} {t('outline.failed')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="mt-1.5 text-[10.5px] font-semibold text-red-800 underline underline-offset-2"
                            onClick={() => onRetryDocument(lecture)}
                          >
                            {t('upload.retry')}
                          </button>
                        </div>
                      ) : roots.length === 0 ? (
                        <div className="rounded-lg bg-parchment/50 px-2 py-2">
                          <p className="text-[10.5px] leading-4 text-muted">{t('outline.noTopics')}</p>
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 hover:underline"
                            onClick={onRefresh}
                          >
                            <RefreshCw size={10} />
                            {t('outline.refresh')}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {roots.map((node) => (
                            <TopicNodeRow
                              key={node.id}
                              node={node}
                              selectedTopicId={selectedTopicId}
                              collapsedNodes={collapsedNodes}
                              toggleNode={toggleNode}
                              onSelectTopic={onSelectTopic}
                            />
                          ))}
                        </div>
                      )}

                      {lecture.outlineWarning ? (
                        <div className="mt-1 flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-[9px] leading-4 text-amber-800">
                          <AlertTriangle size={9} className="mt-0.5 shrink-0" />
                          <span>
                            {lecture.outlineWarning === 'AI_OUTLINE_FAILED'
                              ? t('outline.aiFailed')
                              : lecture.outlineWarning === 'AI_MODEL_UNAVAILABLE'
                                ? t('outline.aiModelUnavailable')
                                : lecture.outlineWarning}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-1 flex flex-wrap items-center gap-1 px-1.5 py-1">
                        <span className="flex items-center gap-1 text-[9.5px] text-muted">
                          {isAi ? <Sparkles size={9} /> : <Layers3 size={9} />}
                          {isAi
                            ? t('outline.aiGeneratedBy', {
                                model: lecture.outlineModelName || t('common.unknown'),
                              })
                            : lecture.generationMethod === 'headings'
                              ? t('outline.localHeadings')
                              : t('outline.localPages')}
                        </span>
                        {lecture.document.warningCode ? (
                          <span
                            className="badge gap-1 bg-amber-50 text-[9px] text-amber-800"
                            title={t('upload.somePages', {
                              pages: lecture.document.warningPages.join(', '),
                            })}
                          >
                            <AlertTriangle size={9} />
                            {t('upload.warningTitle')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function TopicNodeRow({
  node,
  selectedTopicId,
  collapsedNodes,
  toggleNode,
  onSelectTopic,
}: {
  node: TopicNode;
  selectedTopicId: string | null;
  collapsedNodes: Set<string>;
  toggleNode: (topicId: string) => void;
  onSelectTopic: (topicId: string) => void;
}) {
  const { t } = useTranslation();
  const selected = selectedTopicId === node.id;
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedNodes.has(node.id);
  const Icon = node.kind === 'chapter' ? BookOpen : node.kind === 'section' ? Layers3 : Sparkles;

  return (
    <div>
      <div
        className={`group/topic flex items-start gap-1 rounded-lg transition ${
          selected ? 'bg-teal-700 text-white shadow-sm' : 'text-ink hover:bg-teal-50/80'
        }`}
        style={{ paddingLeft: `${Math.min(node.depth, 2) * 9 + 2}px`, paddingRight: '4px' }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
              selected ? 'text-white/75' : 'text-muted'
            }`}
            onClick={() => toggleNode(node.id)}
            aria-label={collapsed ? t('outline.expandNode') : t('outline.collapseNode')}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
            <Icon size={9} className={selected ? 'text-white/60' : 'text-muted/60'} />
          </span>
        )}
        <button
          type="button"
          onClick={() => onSelectTopic(node.id)}
          data-testid={`topic-${node.id}`}
          aria-label={t('a11y.expandTopic', { number: node.number, title: node.title })}
          className="min-w-0 flex-1 py-1 text-left"
        >
          <span className="flex items-start gap-1.5">
            <span
              className={`mt-0.5 shrink-0 font-mono text-[9px] font-semibold ${
                selected ? 'text-white/75' : 'text-teal-800/70'
              }`}
            >
              {node.number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[11px] font-medium leading-4">{node.title}</span>
              {hasChildren ? (
                <span
                  className={`mt-0.5 block text-[8.5px] ${selected ? 'text-white/60' : 'text-muted'}`}
                >
                  {t('outline.childCount', { count: node.children.length })}
                </span>
              ) : null}
            </span>
            {node.manuallyEdited ? (
              <Pencil
                size={8}
                className={`mt-0.5 shrink-0 ${selected ? 'text-white/60' : 'text-muted'}`}
              />
            ) : null}
          </span>
        </button>
      </div>
      {hasChildren && !collapsed
        ? node.children.map((child) => (
            <TopicNodeRow
              key={child.id}
              node={child}
              selectedTopicId={selectedTopicId}
              collapsedNodes={collapsedNodes}
              toggleNode={toggleNode}
              onSelectTopic={onSelectTopic}
            />
          ))
        : null}
    </div>
  );
}
