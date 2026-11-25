import { useEffect, useState } from 'react';
import { Sparkles, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Lecture, ModelConfig } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface RegenerateDialogProps {
  open: boolean;
  lecture: Lecture | null;
  selectedModel: ModelConfig | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (mode: 'ai' | 'local', preserveManualEdits: boolean) => void;
}

export function RegenerateDialog({
  open,
  lecture,
  selectedModel,
  busy,
  onClose,
  onConfirm,
}: RegenerateDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'ai' | 'local'>('local');
  const [preserve, setPreserve] = useState(true);

  useEffect(() => {
    if (!open) return;
    setMode(selectedModel ? 'ai' : 'local');
    setPreserve(true);
  }, [open, lecture?.id, selectedModel?.id]);

  if (!lecture) return null;
  return (
    <ConfirmDialog
      open={open}
      title={t('outline.regenerateTitle')}
      body={t('outline.regenerateBody')}
      confirmLabel={busy ? t('outline.regenerating') : t('outline.regenerate')}
      onCancel={onClose}
      onConfirm={() => onConfirm(mode, preserve)}
      busy={busy}
      danger={false}
    >
      <div className="space-y-2">
        <button
          type="button"
          disabled={!selectedModel}
          onClick={() => setMode('ai')}
          className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
            mode === 'ai'
              ? 'border-model/35 bg-model/[0.04]'
              : 'border-line bg-white/70 hover:border-model/25'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Sparkles size={15} className="mt-0.5 shrink-0 text-model" />
          <span className="min-w-0">
            <span className="block text-[11.5px] font-semibold text-ink">
              {t('outline.aiReviewOutline')}
            </span>
            <span className="mt-0.5 block text-[10px] leading-4 text-muted">
              {selectedModel
                ? t('outline.aiReviewHint', { model: selectedModel.displayName })
                : t('outline.aiNeedsModel')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMode('local')}
          className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
            mode === 'local'
              ? 'border-teal-700/30 bg-teal-50/60'
              : 'border-line bg-white/70 hover:border-teal-700/20'
          }`}
        >
          <Wrench size={15} className="mt-0.5 shrink-0 text-teal-800" />
          <span className="min-w-0">
            <span className="block text-[11.5px] font-semibold text-ink">
              {t('outline.localReviewOutline')}
            </span>
            <span className="mt-0.5 block text-[10px] leading-4 text-muted">
              {t('outline.localReviewHint')}
            </span>
          </span>
        </button>

        {mode === 'local' ? (
          <label className="flex items-start gap-2 rounded-lg border border-line bg-white/70 px-2.5 py-2">
            <input
              type="checkbox"
              checked={preserve}
              onChange={(event) => setPreserve(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-line text-teal-700 focus:ring-teal-600"
            />
            <span>
              <span className="block text-[11.5px] font-medium text-ink">
                {t('outline.preserveManual')}
              </span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted">
                {t('outline.overwrite')}
              </span>
            </span>
          </label>
        ) : (
          <p className="rounded-lg border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900">
            {t('outline.aiReplaceWarning')}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
