import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Course } from '../types';
import { Modal } from './Modal';

const COLORS = ['#0d746b', '#2457c5', '#9a3412', '#6d3bbf', '#3f6212', '#a21caf'];

interface CourseFormDialogProps {
  open: boolean;
  mode: 'create' | 'rename';
  course: Course | null;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}

export function CourseFormDialog({
  open,
  mode,
  course,
  onClose,
  onSave,
}: CourseFormDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(mode === 'rename' && course ? course.name : '');
    setColor(course?.color ?? COLORS[0]);
    setError(null);
    setBusy(false);
  }, [open, mode, course]);

  const submit = async () => {
    if (!name.trim()) {
      setError(t('courses.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), color);
      onClose();
    } catch {
      setError(t('errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('courses.createTitle') : t('courses.renameTitle')}
      subtitle={mode === 'create' ? t('courses.createSubtitle') : undefined}
      busy={busy}
      width="sm"
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
      <label className="block">
        <span className="label">{t('courses.name')}</span>
        <input
          className="input"
          value={name}
          autoFocus
          maxLength={80}
          placeholder={t('courses.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
      </label>
      <div className="mt-4">
        <span className="label">{t('courses.color')}</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className={`h-8 w-8 rounded-full border-2 transition ${
                color === option ? 'border-ink scale-105' : 'border-white'
              }`}
              style={{ backgroundColor: option }}
              onClick={() => setColor(option)}
              aria-label={t('courses.colorAria', { color: option })}
            />
          ))}
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}
