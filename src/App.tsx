import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquareText,
  PanelLeft,
  Plus,
  UploadCloud,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AppConfig,
  AppSettings,
  ChatMessage,
  Course,
  DocumentDto,
  Lecture,
  ModelConfig,
  Outline,
  Topic,
  UploadingFile,
} from './types';
import { api, ApiClientError, uploadPdfs } from './lib/api';
import { formatDate, translateError } from './lib/format';
import { findDeepestTopicForPage, siblingTopics } from './lib/outline';
import { TopBar } from './components/TopBar';
import { CourseLibrary } from './components/CourseLibrary';
import { UploadZone } from './components/UploadZone';
import { OutlineTree } from './components/OutlineTree';
import { TopicDetail } from './components/TopicDetail';
import { MaterialsPanel } from './components/MaterialsPanel';
import { ChatPanel } from './components/ChatPanel';
import { CourseFormDialog } from './components/CourseFormDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { TextPromptDialog } from './components/TextPromptDialog';
import { RegenerateDialog } from './components/RegenerateDialog';
import { TopicEditDialog } from './components/TopicEditDialog';
import { SplitDialog } from './components/SplitDialog';
import { ImportModelDialog } from './components/ImportModelDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ToastStack, type ToastItem, type ToastTone } from './components/Toast';

const MODEL_STORAGE_KEY = 'courseatlas.selectedModelId';
const LANGUAGE_STORAGE_KEY = 'courseatlas.language';

type ModalState =
  | { type: 'newCourse' }
  | { type: 'renameCourse'; course: Course }
  | { type: 'deleteCourse'; course: Course }
  | { type: 'editLecture'; lecture: Lecture }
  | { type: 'deleteLecture'; lecture: Lecture }
  | { type: 'regenerate'; lecture: Lecture }
  | { type: 'editTopic'; topic: Topic }
  | { type: 'mergeTopic'; topic: Topic }
  | { type: 'splitTopic'; topic: Topic }
  | { type: 'clearChat' }
  | { type: 'deleteModel'; model: ModelConfig }
  | null;

type MobilePane = 'outline' | 'detail' | 'chat';

export default function App() {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh') ? 'zh' : 'en';

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [collapsedLectures, setCollapsedLectures] = useState<Set<string>>(new Set());
  const [focusSource, setFocusSource] = useState<{
    documentId: string;
    page: number;
    nonce: number;
  } | null>(null);
  const [activePane, setActivePane] = useState<MobilePane>('outline');

  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [importModelOpen, setImportModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `toast-${toastCounter.current + 1}`;
    toastCounter.current += 1;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [courseList, modelList, appSettings, appConfig] = await Promise.all([
          api.listCourses(),
          api.listModels(),
          api.getSettings(),
          api.getConfig(),
        ]);
        if (!alive) return;
        setCourses(courseList);
        setModels(modelList);
        setSettings(appSettings);
        setConfig(appConfig);
        const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
        if (storedModel && modelList.some((model) => model.id === storedModel)) {
          setSelectedModelId(storedModel);
        } else if (storedModel) {
          window.localStorage.removeItem(MODEL_STORAGE_KEY);
        }
        setSelectedCourseId((current) => current ?? courseList[0]?.id ?? null);
      } catch (error) {
        if (alive) {
          notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
        }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Boot runs once. Translations are read at the time of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => {
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    };
    handler();
  }, [language]);

  const refreshCourses = useCallback(async () => {
    const next = await api.listCourses();
    setCourses(next);
    return next;
  }, []);

  const refreshOutline = useCallback(async (courseId: string) => {
    const next = await api.getOutline(courseId);
    setOutline(next);
    setDocuments(next.documents);
    const topicIds = new Set(next.lectures.flatMap((lecture) => lecture.topics.map((topic) => topic.id)));
    setSelectedTopicId((current) =>
      current && topicIds.has(current)
        ? current
        : (next.lectures.flatMap((lecture) => lecture.topics)[0]?.id ?? null),
    );
    return next;
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setOutline(null);
      setDocuments([]);
      setMessages([]);
      setSelectedTopicId(null);
      return;
    }
    let cancelled = false;
    setOutlineLoading(true);
    setChatLoading(true);
    setSelectedTopicId(null);
    setFocusSource(null);
    setCollapsedLectures(new Set());
    Promise.all([api.getOutline(selectedCourseId), api.listChat(selectedCourseId)])
      .then(([nextOutline, nextMessages]) => {
        if (cancelled) return;
        setOutline(nextOutline);
        setDocuments(nextOutline.documents);
        setMessages(nextMessages);
        setSelectedTopicId(
          nextOutline.lectures.flatMap((lecture) => lecture.topics)[0]?.id ?? null,
        );
      })
      .catch((error) => {
        if (cancelled) return;
        notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setOutlineLoading(false);
        setChatLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  const statusSignature = documents
    .map((document) => `${document.id}:${document.status}`)
    .join('|');
  useEffect(() => {
    if (!selectedCourseId || !documents.some(hasActiveWork)) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const nextDocuments = await api.listDocuments(selectedCourseId);
        if (cancelled) return;
        if (nextDocuments.some(hasActiveWork)) {
          setDocuments(nextDocuments);
          setOutline((current) =>
            current
              ? {
                  ...current,
                  documents: nextDocuments,
                  lectures: syncLectureDocuments(current.lectures, nextDocuments),
                }
              : current,
          );
          timer = window.setTimeout(tick, 1200);
          return;
        }
        // Do not publish "ready" documents before the finished outline is
        // available: that creates a transient "no topics" state. Fetch the
        // outline first, then switch both pieces of state together.
        const nextOutline = await api.getOutline(selectedCourseId);
        if (cancelled) return;
        setOutline(nextOutline);
        setDocuments(nextOutline.documents);
        const topicIds = new Set(
          nextOutline.lectures.flatMap((lecture) => lecture.topics.map((topic) => topic.id)),
        );
        setSelectedTopicId((current) =>
          current && topicIds.has(current)
            ? current
            : (nextOutline.lectures.flatMap((lecture) => lecture.topics)[0]?.id ?? null),
        );
        await refreshCourses();
        if (!cancelled) notify(t('toasts.documentReady'), 'success');
      } catch {
        if (!cancelled) timer = window.setTimeout(tick, 2400);
      }
    };
    timer = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // statusSignature restarts polling whenever the server reports a new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, statusSignature]);

  const currentCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const selectedTopic = useMemo(() => {
    if (!outline) return null;
    for (const lecture of outline.lectures) {
      const topic = lecture.topics.find((item) => item.id === selectedTopicId);
      if (topic) return topic;
    }
    return null;
  }, [outline, selectedTopicId]);
  const selectedLecture = useMemo(() => {
    if (!outline || !selectedTopic) return null;
    return outline.lectures.find((lecture) => lecture.id === selectedTopic.lectureId) ?? null;
  }, [outline, selectedTopic]);
  const siblings = useMemo(
    () => siblingTopics(selectedLecture?.topics ?? [], selectedTopic),
    [selectedLecture, selectedTopic],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const activeDocumentCount = documents.filter(hasActiveWork).length;

  const handleRefreshOutline = async () => {
    if (!selectedCourseId) return;
    try {
      await refreshOutline(selectedCourseId);
      await refreshCourses();
      notify(t('toasts.outlineRefreshed'), 'success');
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    }
  };

  const changeLanguage = (nextLanguage: string) => {
    const next = nextLanguage === 'zh' ? 'zh' : 'en';
    void i18n.changeLanguage(next);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  };

  const selectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!selectedCourseId) {
      notify(t('courses.selectHint'), 'error');
      return;
    }
    const maxMb = config?.maxUploadMb ?? 20;
    const limited = files.slice(0, 20);
    if (files.length > 20) notify(t('upload.maxFiles'), 'error');

    const valid: File[] = [];
    const nextItems: UploadingFile[] = [];
    for (const file of limited) {
      const id = crypto.randomUUID();
      const isPdf =
        /\.pdf$/i.test(file.name) &&
        (!file.type || ['application/pdf', 'application/x-pdf', 'application/octet-stream'].includes(file.type));
      if (!isPdf) {
        nextItems.push({
          id,
          filename: file.name,
          progress: 0,
          status: 'rejected',
          errorCode: 'NOT_PDF',
        });
      } else if (file.size > maxMb * 1024 * 1024) {
        nextItems.push({
          id,
          filename: file.name,
          progress: 0,
          status: 'rejected',
          errorCode: 'FILE_TOO_LARGE',
        });
      } else {
        valid.push(file);
        nextItems.push({
          id,
          filename: file.name,
          progress: 0,
          status: 'uploading',
          errorCode: null,
        });
      }
    }

    setUploadingFiles((current) => [...current, ...nextItems]);
    if (valid.length === 0) {
      notify(translateError(t, nextItems[0]?.errorCode ?? 'NOT_PDF'), 'error');
      return;
    }

    const validIds = new Set(
      nextItems.filter((item) => item.status === 'uploading').map((item) => item.id),
    );
    try {
      const created = await uploadPdfs(
        selectedCourseId,
        valid,
        (percent) => {
          setUploadingFiles((current) =>
            current.map((item) =>
              validIds.has(item.id) ? { ...item, progress: percent } : item,
            ),
          );
        },
        selectedModelId,
      );
      setUploadingFiles((current) => current.filter((item) => !validIds.has(item.id)));
      const nextOutline = await api.getOutline(selectedCourseId);
      setOutline(nextOutline);
      setDocuments(nextOutline.documents);
      notify(t('toasts.uploadQueued'), 'success');
      await refreshCourses();
      if (created.length > 0) setActivePane('outline');
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'UPLOAD_FAILED';
      setUploadingFiles((current) =>
        current.map((item) =>
          validIds.has(item.id) ? { ...item, status: 'failed', errorCode: code } : item,
        ),
      );
      notify(translateError(t, code), 'error');
    }
  };

  const retryDocument = async (documentId: string) => {
    try {
      await api.retryDocument(documentId);
      const nextDocuments = await api.listDocuments(selectedCourseId ?? '');
      setDocuments(nextDocuments);
      setOutline((current) =>
        current
          ? { ...current, documents: nextDocuments, lectures: syncLectureDocuments(current.lectures, nextDocuments) }
          : current,
      );
      notify(t('toasts.retryStarted'), 'info');
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    }
  };

  const handleSend = async (question: string, lectureId?: string) => {
    if (!selectedCourseId) throw new ApiClientError('COURSE_NOT_FOUND', 404, 'No course.');
    if (!selectedModelId) throw new ApiClientError('MODEL_REQUIRED', 400, 'No model.');
    const message = await api.sendChat({
      courseId: selectedCourseId,
      modelId: selectedModelId,
      question,
      lectureId,
    });
    setMessages((current) => [...current, message]);
  };

  const handleFeedback = async (messageId: string, feedback: 'up' | 'down' | null) => {
    const updated = await api.setFeedback(messageId, feedback);
    setMessages((current) => current.map((message) => (message.id === messageId ? updated : message)));
  };

  const handleCitationClick = (documentId: string, page: number) => {
    if (!outline) return;
    const matches = outline.lectures.flatMap((lecture) => {
      const topic = findDeepestTopicForPage(lecture.topics, documentId, page);
      return topic ? [{ lecture, topic }] : [];
    });
    const chosen =
      matches.find((match) => match.lecture.id === selectedLecture?.id) ?? matches[0];
    if (!chosen) {
      notify(t('toasts.citationNotFound'), 'info');
      return;
    }
    setSelectedTopicId(chosen.topic.id);
    setSelectedLectureExpanded(chosen.lecture.id);
    setFocusSource({ documentId, page, nonce: Date.now() });
    setActivePane('detail');
  };

  const setSelectedLectureExpanded = (lectureId: string) => {
    setCollapsedLectures((current) => {
      if (!current.has(lectureId)) return current;
      const next = new Set(current);
      next.delete(lectureId);
      return next;
    });
  };

  const toggleLecture = (lectureId: string) => {
    setCollapsedLectures((current) => {
      const next = new Set(current);
      if (next.has(lectureId)) next.delete(lectureId);
      else next.add(lectureId);
      return next;
    });
  };

  const openDeleteDocument = (document: DocumentDto) => {
    if (!outline) return;
    const lecture = outline.lectures.find((item) => item.documentId === document.id);
    if (lecture) setModal({ type: 'deleteLecture', lecture });
  };

  const deleteLecture = async () => {
    if (!modal || modal.type !== 'deleteLecture' || !selectedCourseId) return;
    setConfirmBusy(true);
    try {
      await api.deleteDocument(modal.lecture.documentId);
      setModal(null);
      await refreshOutline(selectedCourseId);
      await refreshCourses();
      notify(t('toasts.documentDeleted'), 'success');
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleRegenerate = async (
    mode: 'ai' | 'local',
    preserveManualEdits: boolean,
  ) => {
    if (!modal || modal.type !== 'regenerate' || !selectedCourseId) return;
    setRegenerating(true);
    try {
      await api.regenerateOutline(selectedCourseId, modal.lecture.id, {
        mode,
        modelId: mode === 'ai' ? selectedModelId : null,
        preserveManualEdits,
      });
      setModal(null);
      await refreshOutline(selectedCourseId);
      await refreshCourses();
      notify(t('toasts.outlineRegenerated'), 'success');
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handleClearChat = async () => {
    if (!selectedCourseId) return;
    setConfirmBusy(true);
    try {
      await api.clearChat(selectedCourseId);
      setMessages([]);
      setModal(null);
      notify(t('toasts.chatCleared'), 'success');
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!modal || modal.type !== 'deleteModel') return;
    setConfirmBusy(true);
    try {
      await api.deleteModel(modal.model.id);
      setModels((current) => current.filter((model) => model.id !== modal.model.id));
      if (selectedModelId === modal.model.id) {
        setSelectedModelId(null);
        window.localStorage.removeItem(MODEL_STORAGE_KEY);
        notify(t('models.deleteCurrentDone'), 'success');
      } else {
        notify(t('toasts.modelDeleted'), 'success');
      }
      setModal(null);
    } catch (error) {
      notify(translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'), 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const mergeNextTopic =
    modal?.type === 'mergeTopic' && outline
      ? findNextTopic(outline, modal.topic)
      : null;

  const paneClasses = (pane: MobilePane) =>
    `${activePane === pane ? 'flex' : 'hidden'} min-h-0 min-w-0 xl:flex`;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <TopBar
        course={currentCourse}
        language={language}
        searchConfigured={Boolean(config?.searchConfigured)}
        onLanguageChange={changeLanguage}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <nav className="flex h-10 shrink-0 items-stretch border-b border-line/80 bg-white/55 xl:hidden">
        {(
          [
            ['outline', PanelLeft, t('app.mobileOutline')],
            ['detail', BookOpen, t('app.mobileDetail')],
            ['chat', MessageSquareText, t('app.mobileChat')],
          ] as const
        ).map(([pane, Icon, label]) => (
          <button
            key={pane}
            type="button"
            onClick={() => setActivePane(pane)}
            className={`flex flex-1 items-center justify-center gap-1.5 text-[11px] font-semibold transition ${
              activePane === pane
                ? 'border-b-2 border-teal-700 text-teal-800'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <aside
          className={`${paneClasses('outline')} flex-col overflow-hidden border-r border-line/80 bg-paper/45`}
        >
          <CourseLibrary
            courses={courses}
            selectedCourseId={selectedCourseId}
            language={language}
            onSelect={(courseId) => {
              setSelectedCourseId(courseId);
              setActivePane('outline');
            }}
            onCreate={() => setModal({ type: 'newCourse' })}
            onRename={(course) => setModal({ type: 'renameCourse', course })}
            onDelete={(course) => setModal({ type: 'deleteCourse', course })}
          />
          <UploadZone
            maxMb={config?.maxUploadMb ?? 20}
            disabled={!selectedCourseId}
            activeCount={activeDocumentCount}
            outlineModelName={selectedModel?.displayName ?? null}
            onFiles={(files) => void handleUploadFiles(files)}
          />
          <OutlineTree
            lectures={outline?.lectures ?? []}
            selectedTopicId={selectedTopicId}
            collapsedLectures={collapsedLectures}
            loading={outlineLoading}
            onToggleLecture={toggleLecture}
            onSelectTopic={(topicId) => {
              setSelectedTopicId(topicId);
              setFocusSource(null);
              setActivePane('detail');
            }}
            onEditLecture={(lecture) => setModal({ type: 'editLecture', lecture })}
            onRegenerate={(lecture) => setModal({ type: 'regenerate', lecture })}
            onDeleteLecture={(lecture) => setModal({ type: 'deleteLecture', lecture })}
            onRetryDocument={(lecture) => void retryDocument(lecture.documentId)}
            onRefresh={() => void handleRefreshOutline()}
          />
        </aside>

        <main className={`${paneClasses('detail')} flex-col overflow-hidden bg-paper/25`}>
          {booting ? (
            <div className="space-y-3 p-5">
              <div className="skeleton h-10 w-1/2" />
              <div className="skeleton h-36 w-full" />
              <div className="skeleton h-24 w-full" />
            </div>
          ) : !currentCourse ? (
            <EmptyWorkspace onCreate={() => setModal({ type: 'newCourse' })} />
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line/80 bg-white/35 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: currentCourse.color }}
                    />
                    <h2 className="truncate font-display text-[15px] font-semibold text-ink">
                      {currentCourse.name}
                    </h2>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {t('courses.stats', {
                      documents: currentCourse.documentCount,
                      lectures: currentCourse.lectureCount,
                      topics: currentCourse.topicCount,
                    })}
                    {' · '}
                    {t('courses.updated', { date: formatDate(currentCourse.updatedAt, language) })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeDocumentCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[9.5px] font-semibold text-sky-800">
                      <Loader2 size={10} className="animate-spin" />
                      {activeDocumentCount}
                    </span>
                  ) : null}
                  <span className="chip">
                    <FileText size={10} />
                    {t('upload.pdfOnly')}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {outlineLoading ? (
                  <div className="space-y-3 p-5">
                    <div className="skeleton h-8 w-2/3" />
                    <div className="skeleton h-28 w-full" />
                    <div className="skeleton h-20 w-full" />
                  </div>
                ) : outline && outline.lectures.length === 0 ? (
                  <div className="mx-auto max-w-3xl px-5 py-10">
                    <div className="rounded-2xl border border-dashed border-line bg-white/55 px-5 py-8 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700/10 text-teal-800">
                        <UploadCloud size={23} />
                      </div>
                      <h2 className="font-display text-xl font-semibold text-ink">
                        {t('outline.emptyTitle')}
                      </h2>
                      <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-6 text-muted">
                        {t('outline.emptyBody')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <TopicDetail
                    topic={selectedTopic}
                    lecture={selectedLecture}
                    siblings={siblings}
                    language={language}
                    focusSource={focusSource}
                    onSelectTopic={(topicId) => {
                      setSelectedTopicId(topicId);
                      setFocusSource(null);
                    }}
                    onEdit={(topic) => setModal({ type: 'editTopic', topic })}
                    onMerge={(topic) => setModal({ type: 'mergeTopic', topic })}
                    onSplit={(topic) => setModal({ type: 'splitTopic', topic })}
                  />
                )}
                {outline ? (
                  <MaterialsPanel
                    documents={documents}
                    lectures={outline.lectures}
                    uploadingFiles={uploadingFiles}
                    onRetry={(documentId) => void retryDocument(documentId)}
                    onDelete={openDeleteDocument}
                    onDismissUpload={(uploadId) =>
                      setUploadingFiles((current) => current.filter((item) => item.id !== uploadId))
                    }
                  />
                ) : null}
              </div>
            </>
          )}
        </main>

        <aside
          className={`${paneClasses('chat')} flex-col overflow-hidden border-l border-line/80 bg-white/45`}
        >
          <ChatPanel
            course={currentCourse}
            models={models}
            selectedModelId={selectedModelId}
            messages={messages}
            messagesLoading={chatLoading}
            lectures={outline?.lectures ?? []}
            settings={settings}
            config={config}
            language={language}
            onSelectModel={selectModel}
            onOpenImportModel={() => setImportModelOpen(true)}
            onDeleteModelRequest={(model) => setModal({ type: 'deleteModel', model })}
            onSend={handleSend}
            onClearRequest={() => setModal({ type: 'clearChat' })}
            onCitationClick={handleCitationClick}
            onFeedback={handleFeedback}
            onNotify={notify}
          />
        </aside>
      </div>

      <CourseFormDialog
        open={modal?.type === 'newCourse' || modal?.type === 'renameCourse'}
        mode={modal?.type === 'renameCourse' ? 'rename' : 'create'}
        course={modal?.type === 'renameCourse' ? modal.course : null}
        onClose={() => setModal(null)}
        onSave={async (name, color) => {
          if (modal?.type === 'renameCourse') {
            const updated = await api.updateCourse(modal.course.id, { name, color });
            setCourses((current) =>
              current.map((course) => (course.id === updated.id ? updated : course)),
            );
            notify(t('toasts.courseRenamed'), 'success');
            return;
          }
          const created = await api.createCourse(name, color);
          setCourses((current) => [created, ...current]);
          setSelectedCourseId(created.id);
          notify(t('toasts.courseCreated'), 'success');
        }}
      />

      <ConfirmDialog
        open={modal?.type === 'deleteCourse'}
        title={t('courses.deleteTitle')}
        body={modal?.type === 'deleteCourse' ? t('courses.deleteBody') : ''}
        confirmLabel={t('courses.deleteConfirm')}
        busy={confirmBusy}
        onCancel={() => setModal(null)}
        onConfirm={() => {
          void (async () => {
            if (modal?.type !== 'deleteCourse') return;
            setConfirmBusy(true);
            try {
              await api.deleteCourse(modal.course.id);
              const nextCourses = await api.listCourses();
              setCourses(nextCourses);
              if (selectedCourseId === modal.course.id) {
                setSelectedCourseId(nextCourses[0]?.id ?? null);
              }
              setModal(null);
              notify(t('toasts.courseDeleted'), 'success');
            } catch (error) {
              notify(
                translateError(t, error instanceof ApiClientError ? error.code : 'UNKNOWN'),
                'error',
              );
            } finally {
              setConfirmBusy(false);
            }
          })();
        }}
      />

      <TextPromptDialog
        open={modal?.type === 'editLecture'}
        title={t('outline.editLecture')}
        label={t('outline.editLectureLabel')}
        initialValue={modal?.type === 'editLecture' ? modal.lecture.title : ''}
        placeholder={t('outline.lectureTitlePlaceholder')}
        confirmLabel={t('common.save')}
        onClose={() => setModal(null)}
        onConfirm={async (title) => {
          if (modal?.type !== 'editLecture' || !selectedCourseId) return;
          await api.updateLecture(modal.lecture.id, title);
          await refreshOutline(selectedCourseId);
          notify(t('toasts.lectureRenamed'), 'success');
        }}
      />

      <ConfirmDialog
        open={modal?.type === 'deleteLecture'}
        title={t('upload.removeTitle')}
        body={
          modal?.type === 'deleteLecture'
            ? t('upload.removeBody', { filename: modal.lecture.document.filename })
            : ''
        }
        confirmLabel={t('upload.deleteLecture')}
        busy={confirmBusy}
        onCancel={() => setModal(null)}
        onConfirm={() => void deleteLecture()}
      />

      <RegenerateDialog
        open={modal?.type === 'regenerate'}
        lecture={modal?.type === 'regenerate' ? modal.lecture : null}
        selectedModel={selectedModel}
        busy={regenerating}
        onClose={() => setModal(null)}
        onConfirm={(mode, preserve) => void handleRegenerate(mode, preserve)}
      />

      <TopicEditDialog
        open={modal?.type === 'editTopic'}
        topic={modal?.type === 'editTopic' ? modal.topic : null}
        onClose={() => setModal(null)}
        onSave={async (input) => {
          if (modal?.type !== 'editTopic' || !selectedCourseId) return;
          await api.updateTopic(modal.topic.id, input);
          await refreshOutline(selectedCourseId);
          await refreshCourses();
          notify(t('toasts.topicUpdated'), 'success');
        }}
      />

      <TextPromptDialog
        open={modal?.type === 'mergeTopic'}
        title={t('outline.mergeTitle')}
        label={t('outline.mergeName')}
        initialValue={
          modal?.type === 'mergeTopic' && mergeNextTopic
            ? `${modal.topic.title} / ${mergeNextTopic.title}`
            : ''
        }
        body={t('outline.mergeBody')}
        confirmLabel={t('outline.merge')}
        onClose={() => setModal(null)}
        onConfirm={async (title) => {
          if (modal?.type !== 'mergeTopic' || !selectedCourseId) return;
          await api.mergeTopic(modal.topic.id, title);
          await refreshOutline(selectedCourseId);
          await refreshCourses();
          notify(t('toasts.topicMerged'), 'success');
        }}
      />

      <SplitDialog
        open={modal?.type === 'splitTopic'}
        topic={modal?.type === 'splitTopic' ? modal.topic : null}
        onClose={() => setModal(null)}
        onConfirm={async (title, keptSourceRefs) => {
          if (modal?.type !== 'splitTopic' || !selectedCourseId) return;
          await api.splitTopic(modal.topic.id, { title, keptSourceRefs });
          await refreshOutline(selectedCourseId);
          await refreshCourses();
          notify(t('toasts.topicSplit'), 'success');
        }}
      />

      <ImportModelDialog
        open={importModelOpen}
        config={config}
        onClose={() => setImportModelOpen(false)}
        onImported={(model) => {
          setModels((current) => [...current, model]);
          selectModel(model.id);
          notify(t('toasts.modelImported'), 'success');
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        config={config}
        language={language}
        modelCount={models.length}
        onClose={() => setSettingsOpen(false)}
        onLanguageChange={changeLanguage}
        onSaved={(nextSettings) => {
          setSettings(nextSettings);
          notify(t('toasts.settingsSaved'), 'success');
        }}
      />

      <ConfirmDialog
        open={modal?.type === 'clearChat'}
        title={t('chat.clearTitle')}
        body={t('chat.clearBody')}
        confirmLabel={t('chat.clearConfirm')}
        busy={confirmBusy}
        onCancel={() => setModal(null)}
        onConfirm={() => void handleClearChat()}
      />

      <ConfirmDialog
        open={modal?.type === 'deleteModel'}
        title={t('models.deleteTitle')}
        body={
          modal?.type === 'deleteModel'
            ? t('models.deleteBody', { name: modal.model.displayName })
            : ''
        }
        confirmLabel={t('models.deleteConfirm')}
        busy={confirmBusy}
        onCancel={() => setModal(null)}
        onConfirm={() => void handleDeleteModel()}
      >
        {modal?.type === 'deleteModel' && selectedModelId === modal.model.id ? (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
            {t('models.deleteCurrent')}
          </p>
        ) : null}
      </ConfirmDialog>

      <ToastStack
        items={toasts}
        dismissLabel={t('common.dismiss')}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </div>
  );
}

function hasActiveWork(document: DocumentDto): boolean {
  return ['queued', 'parsing', 'outlining'].includes(document.status);
}

function syncLectureDocuments(lectures: Lecture[], documents: DocumentDto[]): Lecture[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  return lectures.map((lecture) => {
    const document = byId.get(lecture.documentId);
    if (!document) return lecture;
    return {
      ...lecture,
      document: {
        ...lecture.document,
        filename: document.filename,
        pageCount: document.pageCount,
        status: document.status,
        errorCode: document.errorCode,
        warningCode: document.warningCode,
        warningPages: document.warningPages,
      },
    };
  });
}

function findNextTopic(outline: Outline, topic: Topic): Topic | null {
  const lecture = outline.lectures.find((item) => item.id === topic.lectureId);
  if (!lecture) return null;
  const index = lecture.topics.findIndex((item) => item.id === topic.id);
  return index >= 0 ? (lecture.topics[index + 1] ?? null) : null;
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-paper shadow-float">
        <BookOpen size={30} strokeWidth={1.4} />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white">
          <Plus size={12} />
        </span>
      </div>
      <h1 className="text-balance font-display text-3xl font-semibold tracking-tight text-ink">
        {t('courses.emptyTitle')}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-muted">{t('courses.emptyBody')}</p>
      <button type="button" className="btn-primary mt-5" onClick={onCreate}>
        <Plus size={15} />
        {t('courses.new')}
      </button>
      <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-muted">
        <ChevronRight size={11} />
        {t('app.builtFor')}
      </p>
    </div>
  );
}
