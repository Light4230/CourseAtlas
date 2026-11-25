import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  BookOpenCheck,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Globe2,
  Loader2,
  MessageSquareText,
  Plus,
  SearchX,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, AppSettings, ChatMessage, Course, Lecture, ModelConfig } from '../types';
import { formatDate, formatPercent, translateError } from '../lib/format';
import { ApiClientError } from '../lib/api';
import { SourceBadge } from './SourceBadge';
import { MarkdownAnswer } from './MarkdownAnswer';
import type { ToastTone } from './Toast';

interface ChatPanelProps {
  course: Course | null;
  models: ModelConfig[];
  selectedModelId: string | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  lectures: Lecture[];
  settings: AppSettings | null;
  config: AppConfig | null;
  language: string;
  onSelectModel: (modelId: string) => void;
  onOpenImportModel: () => void;
  onDeleteModelRequest: (model: ModelConfig) => void;
  onSend: (question: string, lectureId?: string) => Promise<void>;
  onClearRequest: () => void;
  onCitationClick: (documentId: string, page: number) => void;
  onFeedback: (messageId: string, feedback: 'up' | 'down' | null) => Promise<void>;
  onNotify: (message: string, tone: ToastTone) => void;
}

export function ChatPanel({
  course,
  models,
  selectedModelId,
  messages,
  messagesLoading,
  lectures,
  settings,
  config,
  language,
  onSelectModel,
  onOpenImportModel,
  onDeleteModelRequest,
  onSend,
  onClearRequest,
  onCitationClick,
  onFeedback,
  onNotify,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scopeLectureId, setScopeLectureId] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const activeLecture = lectures.find((lecture) => lecture.id === scopeLectureId) ?? null;
  const webStatus = !settings?.enableWebSearch
    ? 'off'
    : config?.searchConfigured
      ? 'on'
      : 'missing';

  useEffect(() => {
    setScopeLectureId('');
  }, [course?.id]);

  useEffect(() => {
    if (scopeLectureId && !lectures.some((lecture) => lecture.id === scopeLectureId)) {
      setScopeLectureId('');
    }
  }, [lectures, scopeLectureId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: messages.length > 0 ? 'smooth' : 'auto',
    });
  }, [messages.length, sending]);

  const canSend =
    Boolean(selectedModel) && question.trim().length > 0 && question.length <= 2000 && !sending;

  const submit = async () => {
    if (!selectedModel) {
      setErrorCode('MODEL_REQUIRED');
      return;
    }
    if (!question.trim()) {
      setErrorCode('EMPTY_QUERY');
      return;
    }
    if (question.length > 2000) {
      setErrorCode('QUERY_TOO_LONG');
      return;
    }
    setSending(true);
    setErrorCode(null);
    try {
      await onSend(question.trim(), scopeLectureId || undefined);
      setQuestion('');
      inputRef.current?.focus();
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'CHAT_FAILED');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) void submit();
    }
  };

  const copyAnswer = async (answer: string) => {
    try {
      await navigator.clipboard.writeText(answer);
      onNotify(t('toasts.copied'), 'success');
    } catch {
      onNotify(t('toasts.copyFailed'), 'error');
    }
  };

  const handleFeedback = async (message: ChatMessage, value: 'up' | 'down') => {
    const next = message.feedback === value ? null : value;
    try {
      await onFeedback(message.id, next);
      if (next) onNotify(t('toasts.feedbackSaved'), 'success');
    } catch (error) {
      onNotify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white/55">
      <div className="shrink-0 border-b border-line/80 px-3.5 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles size={15} className="text-teal-700" />
              <h2 className="font-display text-[16px] font-semibold text-ink">{t('chat.title')}</h2>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{t('chat.subtitle')}</p>
          </div>
          <button
            type="button"
            className="btn-ghost h-7 shrink-0 gap-1 px-1.5 text-[10.5px]"
            onClick={onClearRequest}
            disabled={messages.length === 0}
            aria-label={t('a11y.clearChat')}
          >
            <Trash2 size={12} />
            {t('chat.clear')}
          </button>
        </div>

        <div className="relative mt-3" ref={menuRef}>
          <span className="label mb-1">{t('chat.modelLabel')}</span>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left shadow-sm transition hover:border-teal-700/40"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label={t('a11y.modelMenu')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  selectedModel ? 'bg-model/10 text-model' : 'bg-parchment text-muted'
                }`}
              >
                <Sparkles size={14} />
              </span>
              <span className="min-w-0">
                {selectedModel ? (
                  <>
                    <span className="block truncate text-[12px] font-semibold text-ink">
                      {selectedModel.displayName}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] text-muted">
                      {selectedModel.provider === 'deepseek'
                        ? t('models.providerDeepseek')
                        : t('models.providerCompatible')}{' '}
                      · {selectedModel.modelId} · {selectedModel.maskedKey}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-[12px] font-semibold text-ink">
                      {t('models.selectPlaceholder')}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] text-muted">{t('chat.noModel')}</span>
                  </>
                )}
              </span>
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-muted transition ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen ? (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-line bg-white shadow-float"
            >
              <div className="flex items-center justify-between border-b border-line/70 px-3 py-2">
                <span className="section-label">{t('chat.modelList')}</span>
                <span className="text-[9.5px] text-muted">
                  {t('units.models', { count: models.length })}
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {models.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] leading-5 text-muted">
                    {t('models.noModelsInMenu')}
                  </p>
                ) : (
                  models.map((model) => {
                    const active = model.id === selectedModelId;
                    return (
                      <div
                        key={model.id}
                        className={`group flex items-center gap-1 rounded-lg px-1 transition ${
                          active ? 'bg-teal-50' : 'hover:bg-parchment/45'
                        }`}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1.5 py-2 text-left"
                          onClick={() => {
                            onSelectModel(model.id);
                            setMenuOpen(false);
                          }}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              active ? 'bg-teal-700 text-white' : 'bg-parchment/70 text-muted'
                            }`}
                          >
                            {active ? <Check size={11} /> : <Sparkles size={10} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11.5px] font-semibold text-ink">
                              {model.displayName}
                            </span>
                            <span className="mt-0.5 block truncate text-[9px] text-muted">
                              {model.modelId} · {model.maskedKey}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon h-6 w-6 shrink-0 hover:text-red-700"
                          aria-label={t('a11y.deleteModel', { name: model.displayName })}
                          title={t('chat.deleteModel')}
                          onClick={() => {
                            setMenuOpen(false);
                            onDeleteModelRequest(model);
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-line/70 px-3 py-2.5 text-left text-[11.5px] font-semibold text-teal-800 transition hover:bg-teal-50"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenImportModel();
                }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-white">
                  <Plus size={11} />
                </span>
                {t('models.importEntry')}
              </button>
            </div>
          ) : null}
          <p className="mt-1.5 text-[9.5px] leading-4 text-muted">{t('chat.modelHint')}</p>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-semibold text-muted">{t('chat.scope')}</span>
            <select
              value={scopeLectureId}
              onChange={(event) => setScopeLectureId(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-white/80 px-2 py-1 text-[10.5px] text-ink focus:border-teal-600 focus:outline-none"
              title={t('chat.scopeHint')}
            >
              <option value="">{t('chat.scopeCourse')}</option>
              {lectures.map((lecture) => (
                <option key={lecture.id} value={lecture.id}>
                  {t('chat.scopeLectureNamed', { lecture: lecture.title })}
                </option>
              ))}
            </select>
          </label>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              webStatus === 'on'
                ? 'bg-web/10 text-web'
                : webStatus === 'missing'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-ink/[0.05] text-muted'
            }`}
            title={
              webStatus === 'missing'
                ? t('chat.webNotConfigured')
                : webStatus === 'on'
                  ? t('chat.webConfigured')
                  : t('chat.searchDisabled')
            }
          >
            <Globe2 size={9} />
            {webStatus === 'on'
              ? t('chat.searchOn')
              : webStatus === 'missing'
                ? t('chat.searchNotConfigured')
                : t('chat.searchDisabled')}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!course ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <BookOpenCheck size={30} className="text-line" />
            <p className="mt-3 text-sm font-semibold text-ink">{t('courses.noneSelected')}</p>
            <p className="mt-1 max-w-xs text-[11px] leading-5 text-muted">{t('courses.selectHint')}</p>
          </div>
        ) : messagesLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-16 w-4/5" />
            <div className="skeleton ml-auto h-12 w-2/3" />
          </div>
        ) : messages.length === 0 && !sending ? (
          <ChatEmpty
            hasModels={models.length > 0}
            onImport={onOpenImportModel}
          />
        ) : (
          <div className="space-y-3.5">
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                language={language}
                onCopy={() => void copyAnswer(message.answer)}
                onFeedback={(value) => void handleFeedback(message, value)}
                onCitationClick={onCitationClick}
              />
            ))}
            {sending ? (
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-model/10 text-model">
                  <Loader2 size={13} className="animate-spin" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-line bg-white px-3 py-2.5">
                  <p className="text-[11.5px] font-semibold text-ink">{t('chat.sending')}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted">{t('chat.thinkingHint')}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line/80 bg-paper/70 px-3 pb-3 pt-2.5 safe-bottom">
        {!selectedModel ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/80 px-2.5 py-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-amber-800" />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold text-amber-900">{t('chat.noModel')}</p>
              <p className="mt-0.5 text-[9.5px] leading-4 text-amber-800/90">{t('chat.importFirst')}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md bg-amber-900 px-1.5 py-1 text-[9px] font-semibold text-white"
              onClick={onOpenImportModel}
            >
              {t('models.importEntry')}
            </button>
          </div>
        ) : null}

        {errorCode ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-300/50 bg-red-50 px-2.5 py-2">
            <SearchX size={13} className="mt-0.5 shrink-0 text-red-700" />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold leading-4 text-red-900">
                {translateError(t, errorCode)}
              </p>
              <p className="mt-0.5 text-[9.5px] leading-4 text-red-800/80">{t('chat.errorBody')}</p>
            </div>
            <button
              type="button"
              className="btn-icon h-5 w-5 shrink-0 text-red-800"
              onClick={() => setErrorCode(null)}
              aria-label={t('common.dismiss')}
            >
              <X size={11} />
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-white p-1.5 shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, 2000))}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={!selectedModel || sending}
            placeholder={
              selectedModel ? t('chat.placeholder') : t('chat.placeholderNoModel')
            }
            className="max-h-36 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[12.5px] leading-5 text-ink placeholder:text-muted/70 focus:outline-none disabled:cursor-not-allowed"
            aria-label={t('chat.placeholder')}
          />
          <div className="flex items-end justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-[9px] text-muted">{t('chat.sendHint')}</p>
              {activeLecture ? (
                <p className="mt-0.5 truncate text-[9px] font-medium text-teal-800">
                  {t('chat.scopeLectureNamed', { lecture: activeLecture.title })}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`text-[9px] ${
                  question.length > 1900 ? 'font-semibold text-red-700' : 'text-muted'
                }`}
              >
                {question.length}/2000
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-line"
                onClick={() => void submit()}
                disabled={!canSend}
                aria-label={t('a11y.sendMessage')}
                title={t('chat.send')}
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatEmpty({ hasModels, onImport }: { hasModels: boolean; onImport: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-3 py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-model/10 text-model">
        <MessageSquareText size={22} strokeWidth={1.5} />
      </div>
      <h3 className="font-display text-base font-semibold text-ink">{t('chat.emptyTitle')}</h3>
      <p className="mt-1.5 max-w-xs text-[10.5px] leading-5 text-muted">{t('chat.emptyBody')}</p>
      {!hasModels ? (
        <button type="button" className="btn-secondary mt-3 h-8 text-[11px]" onClick={onImport}>
          <Plus size={12} />
          {t('models.importEntry')}
        </button>
      ) : null}
    </div>
  );
}

function MessageCard({
  message,
  language,
  onCopy,
  onFeedback,
  onCitationClick,
}: {
  message: ChatMessage;
  language: string;
  onCopy: () => void;
  onFeedback: (feedback: 'up' | 'down') => void;
  onCitationClick: (documentId: string, page: number) => void;
}) {
  const { t } = useTranslation();
  const [showSources, setShowSources] = useState(message.sourceType === 'course_material');
  const confidence = formatPercent(message.confidence);
  const threshold = formatPercent(message.trace.threshold);
  const reason = reasoningText(t, message);
  const hasCourseSources = message.retrievedChunks.length > 0 && message.sourceType === 'course_material';
  const lowChunks = message.sourceType !== 'course_material' ? message.retrievedChunks : [];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-ink px-3 py-2 text-[12px] leading-5 text-paper shadow-sm">
          {message.question}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-model/10 text-model">
          <Sparkles size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl rounded-tl-sm border border-line bg-white px-3 py-2.5 shadow-sm">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <SourceBadge sourceType={message.sourceType} />
              <span className="text-[9px] text-muted">
                {t('chat.confidence', { percent: confidence, threshold })}
              </span>
            </div>

            {message.sourceType === 'model_knowledge' ? (
              <div className="mb-2 rounded-lg border border-model/15 bg-model/[0.05] px-2 py-1.5 text-[10.5px] font-semibold leading-4 text-model">
                {t('chat.evidenceNotice')}
              </div>
            ) : null}
            {message.sourceType === 'web' ? (
              <div className="mb-2 rounded-lg border border-web/15 bg-web/[0.05] px-2 py-1.5 text-[10.5px] font-semibold leading-4 text-web">
                {t('chat.webNotice')}
              </div>
            ) : null}
            {message.sourceType === 'model_knowledge' && message.trace.searchAttempted ? (
              <p className="mb-2 text-[9.5px] leading-4 text-muted">
                {message.trace.fallbackReason === 'search_error'
                  ? t('chat.searchErrorNotice')
                  : message.trace.fallbackReason === 'search_no_results'
                    ? t('chat.searchNoResultsNotice')
                    : t('chat.searchUnavailableNotice')}
              </p>
            ) : null}

            <MarkdownAnswer answer={message.answer} />

            {hasCourseSources ? (
              <div className="mt-2.5 border-t border-line/70 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setShowSources((shown) => !shown)}
                >
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-evidence">
                    <BookOpenCheck size={11} />
                    {t('chat.sources')}
                  </span>
                  <span className="text-[9px] font-medium text-muted">
                    {showSources ? t('chat.closeSources') : t('chat.showSources')}
                  </span>
                </button>
                {showSources ? (
                  <div className="mt-1.5 space-y-1.5">
                    {message.retrievedChunks.map((chunk) => (
                      <div
                        key={chunk.chunkId}
                        className="rounded-lg border border-evidence/15 bg-evidence/[0.035] px-2 py-1.5 transition hover:border-evidence/30 hover:bg-evidence/[0.07]"
                      >
                        <button
                          type="button"
                          onClick={() => onCitationClick(chunk.documentId, chunk.page)}
                          className="block w-full text-left"
                        >
                          <span className="flex items-center gap-1 text-[9.5px] font-semibold text-evidence">
                            <Clipboard size={9} />
                            {chunk.filename} {t('topic.page', { page: chunk.page })}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-ink/70">
                            {chunk.quote}
                          </span>
                        </button>
                        <a
                          href={`/api/documents/${chunk.documentId}/file#page=${chunk.page}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-evidence hover:underline"
                        >
                          {t('chat.openPdf')}
                          <ExternalLink size={9} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {message.sourceType === 'web' && message.searchResults.length > 0 ? (
              <div className="mt-2.5 border-t border-line/70 pt-2">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-web">
                  <Globe2 size={11} />
                  {t('chat.webSources')}
                </div>
                <div className="space-y-1">
                  {message.searchResults.map((result) => (
                    <a
                      key={result.url}
                      href={result.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block rounded-lg border border-web/15 bg-web/[0.035] px-2 py-1.5 transition hover:bg-web/[0.07]"
                    >
                      <span className="block truncate text-[10px] font-semibold text-web">
                        {result.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] text-muted" title={result.url}>
                        {result.url}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {lowChunks.length > 0 ? (
              <details className="mt-2 rounded-lg border border-line/70 bg-parchment/30 px-2 py-1.5">
                <summary className="cursor-pointer text-[9.5px] font-semibold text-muted">
                  {t('chat.retrievedTitle')} ({lowChunks.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {lowChunks.slice(0, 3).map((chunk) => (
                    <p key={chunk.chunkId} className="line-clamp-2 text-[9.5px] leading-4 text-ink/60">
                      {chunk.filename} {t('topic.page', { page: chunk.page })} · {chunk.quote}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}

            <details className="mt-2 rounded-lg border border-line/70 bg-parchment/25 px-2 py-1.5">
              <summary className="cursor-pointer text-[9.5px] font-semibold text-muted">
                {t('chat.why')}
              </summary>
              <div className="mt-1 space-y-1 text-[9.5px] leading-4 text-muted">
                <p>{reason}</p>
                <p>
                  {t('chat.confidenceLabel')}: {confidence}% · {t('chat.reasoning')}:{' '}
                  {message.trace.returned}/{message.trace.topK}
                </p>
                {message.trace.queryTerms.length > 0 ? (
                  <p className="break-words">
                    {message.trace.queryTerms.join(', ')}
                  </p>
                ) : null}
                {message.trace.tools?.length ? (
                  <div className="space-y-0.5 border-t border-line/60 pt-1">
                    <p className="font-semibold text-ink/60">{t('chat.toolsUsed')}</p>
                    {message.trace.tools.map((tool, index) => (
                      <p key={`${tool.name}-${index}`} className="break-words">
                        {tool.name}
                        {tool.ok ? ' · ' : ' · failed · '}
                        {tool.summary}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>

            {message.sourceType === 'model_knowledge' || message.sourceType === 'web' ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-model/20 bg-model/[0.06] px-2 py-1 text-[10px] font-semibold text-model">
                {t('chat.byModel', { model: message.modelDisplayName })}
              </p>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="mr-auto text-[8.5px] text-muted">
              {formatDate(message.createdAt, language)}
            </span>
            <button
              type="button"
              className="btn-icon h-6 w-6"
              onClick={onCopy}
              title={t('chat.copy')}
              aria-label={t('a11y.copyAnswer')}
            >
              <Clipboard size={11} />
            </button>
            <button
              type="button"
              className={`btn-icon h-6 w-6 ${message.feedback === 'up' ? 'bg-teal-50 text-teal-800' : ''}`}
              onClick={() => onFeedback('up')}
              title={t('chat.helpful')}
              aria-label={t('a11y.helpful')}
            >
              <ThumbsUp size={11} />
            </button>
            <button
              type="button"
              className={`btn-icon h-6 w-6 ${message.feedback === 'down' ? 'bg-red-50 text-red-700' : ''}`}
              onClick={() => onFeedback('down')}
              title={t('chat.notHelpful')}
              aria-label={t('a11y.notHelpful')}
            >
              <ThumbsDown size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function reasoningText(t: ReturnType<typeof useTranslation>['t'], message: ChatMessage): string {
  if (message.sourceType === 'course_material') return t('chat.whyCourse');
  if (message.trace.fallbackReason === 'search_error') return t('chat.whySearchError');
  if (message.trace.fallbackReason === 'search_no_results') return t('chat.whySearchNoResults');
  if (message.trace.fallbackReason === 'search_unavailable') return t('chat.whySearchUnavailable');
  if (message.trace.fallbackReason === 'model_fallback_disabled') return t('chat.whyFallbackDisabled');
  if (message.trace.returned === 0) return t('chat.whyNoResults');
  return t('chat.whyLow');
}