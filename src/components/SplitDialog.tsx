import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Topic } from '../types';
import { ApiClientError } from '../lib/api';
import { translateError } from '../lib/format';
import { Modal } from './Modal';

interface SplitDialogProps {
  open: boolean;
  topic: Topic | null;
  onClose: () => void;
  onConfirm: (title: string, keptSourceRefs: number) => Promise<void>;
}

export function SplitDialog({ open, topic, onClose, onConfirm }: SplitDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [kept, setKept] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !topic) return;
    setTitle('');
    setKept(1);
    setBusy(false);
    setError(null);
  }, [open, topic]);

  const submit = async () => {
    if (!title.trim()) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(title.trim(), kept);
      onClose();
    } catch (err) {
      setError(translateError(t, err instanceof ApiClientError ? err.code : 'UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  if (!topic) return null;
  const canSplit = topic.sourceRefs.length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('outline.splitTitle')}
      subtitle={t('outline.splitBody')}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void submit()}
            disabled={busy || !canSplit}
          >
            {busy ? t('common.saving') : t('outline.split')}
          </button>
        </>
      }
    >
      {!canSplit ? (
        <p className="text-sm text-red-700">{t('outline.splitNeedsTwo')}</p>
      ) : (
        <div className="space-y-3.5">
          <label className="block">
            <span className="label">{t('outline.splitName')}</span>
            <input
              className="input"
              value={title}
              autoFocus
              maxLength={160}
              placeholder={t('outline.splitPlaceholder')}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">{t('outline.splitPoint')}</span>
            <select
              className="input"
              value={kept}
              onChange={(event) => setKept(Number(event.target.value))}
            >
              {topic.sourceRefs.slice(1).map((ref, index) => (
                <option key={`${ref.documentId}-${ref.page}-${index}`} value={index + 1}>
                  {ref.filename} {t('topic.page', { page: ref.page })} · {ref.quote.slice(0, 70)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-muted">{t('outline.splitHint')}</span>
          </label>
        </div>
      )}
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}
