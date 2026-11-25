import { useRef, useState, type DragEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { FileText, Loader2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UploadZoneProps {
  maxMb: number;
  disabled: boolean;
  activeCount: number;
  outlineModelName: string | null;
  onFiles: (files: File[]) => void;
}

export function UploadZone({
  maxMb,
  disabled,
  activeCount,
  outlineModelName,
  onFiles,
}: UploadZoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    onFiles(Array.from(fileList));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  return (
    <section className="px-3 pb-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="section-label">{t('upload.title')}</h2>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted">
          <FileText size={11} />
          {t('upload.pdfOnly')}
        </span>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed px-3 py-3 transition ${
          dragging
            ? 'border-teal-700 bg-teal-50/80'
            : 'border-line bg-white/50 hover:border-teal-700/40 hover:bg-white/75'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700/10 text-teal-800">
            <UploadCloud size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-4 text-ink">{t('upload.dropTitle')}</p>
            <p className="mt-1 text-[10.5px] leading-4 text-muted">
              {t('upload.dropBody', { max: maxMb })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn-primary h-7 px-2.5 text-[11px]"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                {t('upload.choose')}
              </button>
              {activeCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-teal-800">
                  <Loader2 size={11} className="animate-spin" />
                  {activeCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-parchment/50 px-2 py-1.5 text-[9.5px] leading-4 text-muted">
          <Sparkles size={10} className="mt-0.5 shrink-0 text-model" />
          <span>
            {outlineModelName
              ? t('upload.aiOutlineWith', { model: outlineModelName })
              : t('upload.aiOutlineFallback')}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          data-testid="pdf-input"
          className="sr-only"
          aria-label={t('a11y.fileInput')}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
