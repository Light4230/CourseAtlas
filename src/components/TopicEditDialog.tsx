import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Topic } from '../types';
import { ApiClientError } from '../lib/api';
import { translateError } from '../lib/format';
import { Modal } from './Modal';

interface TopicEditDialogProps {
  open: boolean;
  topic: Topic | null;
  onClose: () => void;
  onSave: (input: {
    title: string;
    summaryEn: string;
    summaryZh: string;
    keywords: string[];
  }) => Promise<void>;
}

export function TopicEditDialog({ open, topic, onClose, onSave }: TopicEditDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [summaryZh, setSummaryZh] = useState('');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !topic) return;
    setTitle(topic.title);
    setSummaryEn(topic.summaryEn || topic.summary);
    setSummaryZh(topic.summaryZh);
    setKeywords(topic.keywords.join(', '));
    setBusy(false);
    setError(null);
  }, [open, topic]);

  const submit = async () => {
    if (!title.trim()) {
      setError(t('topic.titleRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        summaryEn: summaryEn.trim(),
        summaryZh: summaryZh.trim(),
        keywords: keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(translateError(t, err instanceof ApiClientError ? err.code : 'UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('topic.editTitle')}
      subtitle={t('topic.editSubtitle')}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <span className="label">{t('topic.titleLabel')}</span>
          <input
            className="input"
            value={title}
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">{t('topic.summaryEnLabel')}</span>
          <textarea
            className="input min-h-24 resize-y leading-6"
            value={summaryEn}
            maxLength={1200}
            placeholder={t('topic.summaryPlaceholder')}
            onChange={(event) => setSummaryEn(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">{t('topic.summaryZhLabel')}</span>
          <textarea
            className="input min-h-24 resize-y leading-6"
            value={summaryZh}
            maxLength={1200}
            placeholder={t('topic.summaryZhPlaceholder')}
            onChange={(event) => setSummaryZh(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">{t('topic.keywordsLabel')}</span>
          <input
            className="input"
            value={keywords}
            maxLength={400}
            onChange={(event) => setKeywords(event.target.value)}
          />
          <span className="mt-1 block text-[10px] text-muted">{t('topic.keywordsHint')}</span>
        </label>
      </div>
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}
