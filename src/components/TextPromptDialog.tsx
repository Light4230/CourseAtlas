import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../lib/api';
import { translateError } from '../lib/format';
import { Modal } from './Modal';

interface TextPromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  body?: string;
  confirmLabel: string;
  maxLength?: number;
  required?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
}

export function TextPromptDialog({
  open,
  title,
  label,
  initialValue,
  placeholder,
  body,
  confirmLabel,
  maxLength = 180,
  required = true,
  onClose,
  onConfirm,
}: TextPromptDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setBusy(false);
    setError(null);
  }, [open, initialValue]);

  const submit = async () => {
    if (required && !value.trim()) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value.trim());
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
      title={title}
      busy={busy}
      width="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? t('common.saving') : confirmLabel}
          </button>
        </>
      }
    >
      {body ? <p className="mb-3 text-sm leading-6 text-muted">{body}</p> : null}
      <label className="block">
        <span className="label">{label}</span>
        <input
          className="input"
          value={value}
          autoFocus
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
      </label>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}
