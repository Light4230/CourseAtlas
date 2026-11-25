import { useEffect, useState } from 'react';
import { Globe2, Languages, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, AppSettings } from '../types';
import { api, ApiClientError } from '../lib/api';
import { translateError } from '../lib/format';
import { Modal } from './Modal';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings | null;
  config: AppConfig | null;
  language: string;
  modelCount: number;
  onClose: () => void;
  onLanguageChange: (language: string) => void;
  onSaved: (settings: AppSettings) => void;
}

export function SettingsDialog({
  open,
  settings,
  config,
  language,
  modelCount,
  onClose,
  onLanguageChange,
  onSaved,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [threshold, setThreshold] = useState(45);
  const [allowFallback, setAllowFallback] = useState(true);
  const [webSearch, setWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !settings) return;
    setThreshold(Math.round(settings.highThreshold * 100));
    setAllowFallback(settings.allowModelFallback);
    setWebSearch(settings.enableWebSearch);
    setBusy(false);
    setError(null);
  }, [open, settings]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateSettings({
        highThreshold: threshold / 100,
        allowModelFallback: allowFallback,
        enableWebSearch: webSearch,
      });
      onSaved(updated);
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
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      busy={busy}
      width="md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? t('common.saving') : t('settings.save')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <SlidersHorizontal size={13} className="text-teal-700" />
            <h3 className="section-label">{t('settings.threshold')}</h3>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={95}
              step={1}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-teal-700"
              aria-label={t('a11y.confidence')}
            />
            <span className="w-12 rounded-md bg-ink px-1.5 py-1 text-center font-mono text-[11px] font-semibold text-paper">
              {t('settings.thresholdValue', { percent: threshold })}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-[9.5px] text-muted">
            <span>{t('settings.thresholdRange')}</span>
            <span>{t('settings.thresholdNote')}</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted">{t('settings.thresholdHint')}</p>
        </section>

        <div className="divider" />

        <section className="space-y-3">
          <ToggleRow
            label={t('settings.allowFallback')}
            hint={t('settings.allowFallbackHint')}
            checked={allowFallback}
            onChange={setAllowFallback}
          />
          <ToggleRow
            label={t('settings.webSearch')}
            hint={t('settings.webSearchHint')}
            checked={webSearch}
            onChange={setWebSearch}
            disabled={!config?.searchConfigured}
          />
          <div
            className={`rounded-lg border px-3 py-2 text-[10px] leading-4 ${
              config?.searchConfigured
                ? 'border-teal-700/15 bg-teal-50/60 text-teal-900'
                : 'border-amber-300/50 bg-amber-50/70 text-amber-900'
            }`}
          >
            <p className="flex items-start gap-1.5">
              <Globe2 size={11} className="mt-0.5 shrink-0" />
              <span>
                {config?.searchConfigured
                  ? t('settings.searchConfigured')
                  : t('settings.searchNotConfigured')}
                {config?.searchConfigured && config.searchProvider
                  ? ` ${t('settings.searchProvider', { provider: config.searchProvider })}`
                  : ''}
              </span>
            </p>
            {!config?.searchConfigured ? (
              <p className="mt-1 pl-[18px] text-amber-800/80">{t('settings.searchLocked')}</p>
            ) : null}
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Languages size={13} className="text-teal-700" />
            <h3 className="section-label">{t('settings.interfaceLanguage')}</h3>
          </div>
          <select
            className="input"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            <option value="en">{t('language.english')}</option>
            <option value="zh">{t('language.chinese')}</option>
          </select>
        </section>

        <div className="rounded-lg border border-line bg-white/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-ink">{t('settings.models')}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted">{t('settings.modelsHint')}</p>
          <p className="mt-1 text-[10px] font-medium text-teal-800">
            {t('units.models', { count: modelCount })}
          </p>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Modal>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-45 ${
          checked ? 'bg-teal-700' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
