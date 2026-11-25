import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, ModelConfig } from '../types';
import { api, ApiClientError } from '../lib/api';
import { translateError } from '../lib/format';
import { Modal } from './Modal';

interface ImportModelDialogProps {
  open: boolean;
  config: AppConfig | null;
  onClose: () => void;
  onImported: (model: ModelConfig) => void;
}

export function ImportModelDialog({ open, config, onClose, onImported }: ImportModelDialogProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [provider, setProvider] = useState<'deepseek' | 'openai-compatible'>('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [modelId, setModelId] = useState('deepseek-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setApiKey('');
      setShowKey(false);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const changeProvider = (next: 'deepseek' | 'openai-compatible') => {
    setProvider(next);
    if (next === 'deepseek') {
      if (!baseUrl || baseUrl === 'https://api.openai.com/v1') setBaseUrl('https://api.deepseek.com');
      if (!modelId || modelId === 'gpt-4o-mini') setModelId('deepseek-flash');
    } else {
      if (!baseUrl || baseUrl === 'https://api.deepseek.com') setBaseUrl('https://api.openai.com/v1');
      if (!modelId || modelId === 'deepseek-flash') setModelId('gpt-4o-mini');
    }
  };

  const submit = async () => {
    if (!displayName.trim() || !baseUrl.trim() || !modelId.trim() || !apiKey.trim()) {
      setError(t('models.fieldsRequired'));
      return;
    }
    if (apiKey.trim().length < 4) {
      setError(t('models.keyInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const model = await api.createModel({
        displayName: displayName.trim(),
        provider,
        baseUrl: baseUrl.trim(),
        modelId: modelId.trim(),
        apiKey: apiKey.trim(),
      });
      onImported(model);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.field === 'baseUrl') {
        setError(t('models.invalidUrl'));
      } else {
        setError(translateError(t, err instanceof ApiClientError ? err.code : 'UNKNOWN'));
      }
    } finally {
      setBusy(false);
      setApiKey('');
      setShowKey(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('models.dialogTitle')}
      subtitle={t('models.dialogSubtitle')}
      busy={busy}
      width="md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy}>
            <KeyRound size={14} />
            {busy ? t('models.importing') : t('models.import')}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <span className="label">{t('models.displayName')}</span>
          <input
            className="input"
            value={displayName}
            autoFocus
            maxLength={80}
            placeholder={t('models.displayNamePlaceholder')}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="label">{t('models.provider')}</span>
          <select
            className="input"
            value={provider}
            onChange={(event) =>
              changeProvider(event.target.value as 'deepseek' | 'openai-compatible')
            }
          >
            <option value="deepseek">{t('models.providerDeepseek')}</option>
            <option value="openai-compatible">{t('models.providerCompatible')}</option>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('models.baseUrl')}</span>
            <input
              className="input"
              value={baseUrl}
              maxLength={300}
              placeholder={t('models.baseUrlPlaceholder')}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">{t('models.modelId')}</span>
            <input
              className="input"
              value={modelId}
              maxLength={120}
              placeholder={t('models.modelIdPlaceholder')}
              onChange={(event) => setModelId(event.target.value)}
            />
          </label>
        </div>
        <p className="-mt-2 text-[10px] leading-4 text-muted">
          {t('models.baseUrlHint')}{' '}
          {config?.allowLocalModels ? t('models.localAllowed') : t('models.httpsOnly')}
        </p>

        <label className="block">
          <span className="label">{t('models.apiKey')}</span>
          <div className="relative">
            <input
              className="input pr-10"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              maxLength={500}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={t('models.apiKeyPlaceholder')}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
            <button
              type="button"
              className="btn-icon absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setShowKey((visible) => !visible)}
              aria-label={showKey ? t('models.hideKey') : t('models.showKey')}
              title={showKey ? t('models.hideKey') : t('models.showKey')}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <span className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-muted">
            <LockKeyhole size={11} className="mt-0.5 shrink-0 text-teal-700" />
            {t('models.apiKeyHint')}
          </span>
        </label>

        <div className="rounded-lg border border-teal-700/15 bg-teal-50/60 px-3 py-2 text-[10px] leading-4 text-teal-900">
          {t('models.keyNeverReturned')} {t('models.secure')}.
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}
