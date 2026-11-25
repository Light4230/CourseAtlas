import { AlertTriangle, FileText, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DocumentDto, Lecture, UploadingFile } from '../types';
import { StatusPill } from './StatusPill';
import { translateError } from '../lib/format';

interface MaterialsPanelProps {
  documents: DocumentDto[];
  lectures: Lecture[];
  uploadingFiles: UploadingFile[];
  onRetry: (documentId: string) => void;
  onDelete: (document: DocumentDto) => void;
  onDismissUpload: (uploadId: string) => void;
}

export function MaterialsPanel({
  documents,
  lectures,
  uploadingFiles,
  onRetry,
  onDelete,
  onDismissUpload,
}: MaterialsPanelProps) {
  const { t } = useTranslation();
  const lectureByDocument = new Map(lectures.map((lecture) => [lecture.documentId, lecture]));

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-6 pt-2 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="section-label">{t('upload.title')}</h3>
        <span className="text-[10px] text-muted">
          {t('units.documents', { count: documents.length })}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-line/80 bg-white/60">
        {documents.length === 0 && uploadingFiles.length === 0 ? (
          <p className="px-4 py-4 text-[11.5px] text-muted">{t('upload.empty')}</p>
        ) : null}
        {uploadingFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-start gap-3 border-b border-line/60 px-3 py-2.5 last:border-b-0"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700">
              <UploadCloud size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium text-ink">{file.filename}</p>
              {file.status === 'uploading' ? (
                <div className="mt-1.5">
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-teal-700 transition-all"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[9.5px] text-muted">
                    {t('upload.progress', { percent: file.progress })}
                  </p>
                </div>
              ) : (
                <p className="mt-0.5 text-[9.5px] text-red-700">
                  {translateError(t, file.errorCode)}
                </p>
              )}
            </div>
            <StatusPill status={file.status} />
            {file.status !== 'uploading' ? (
              <button
                type="button"
                className="btn-icon -mr-1 h-6 w-6"
                onClick={() => onDismissUpload(file.id)}
                aria-label={t('common.dismiss')}
              >
                <X size={11} />
              </button>
            ) : null}
          </div>
        ))}
        {documents.map((document) => {
          const lecture = lectureByDocument.get(document.id);
          return (
            <div
              key={document.id}
              data-testid={`document-row-${document.id}`}
              className="flex items-start gap-3 border-b border-line/60 px-3 py-2.5 last:border-b-0"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-parchment text-ink/70">
                <FileText size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-medium text-ink" title={document.filename}>
                  {document.filename}
                </p>
                <p className="mt-0.5 truncate text-[9.5px] text-muted">
                  {lecture ? lecture.title : t('common.unknown')}
                  {document.pageCount
                    ? ` · ${t('units.pages', { count: document.pageCount })}`
                    : ''}
                </p>
                {document.status === 'failed' ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[9.5px] leading-4 text-red-700">
                      {translateError(t, document.errorCode)}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-red-800 underline underline-offset-2"
                      onClick={() => onRetry(document.id)}
                    >
                      <RefreshCw size={9} />
                      {t('upload.retry')}
                    </button>
                  </div>
                ) : null}
                {document.warningCode ? (
                  <p className="mt-1 flex items-start gap-1 text-[9.5px] leading-4 text-amber-800">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                    {t('upload.somePages', {
                      pages: document.warningPages.join(', '),
                    })}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <StatusPill status={document.status} />
                <button
                  type="button"
                  className="btn-icon h-7 w-7 hover:text-red-700"
                  onClick={() => onDelete(document)}
                  data-testid={`delete-document-${document.id}`}
                  title={t('upload.deleteLecture')}
                  aria-label={t('a11y.deletePdf')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
