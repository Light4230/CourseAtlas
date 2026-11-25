import { Compass, Globe2, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Course } from '../types';

interface TopBarProps {
  course: Course | null;
  language: string;
  searchConfigured: boolean;
  onLanguageChange: (language: string) => void;
  onOpenSettings: () => void;
}

export function TopBar({
  course,
  language,
  searchConfigured,
  onLanguageChange,
  onOpenSettings,
}: TopBarProps) {
  const { t } = useTranslation();

  return (
    <header className="relative z-40 flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-line/90 bg-paper/90 px-3 backdrop-blur-md sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-paper shadow-sm">
          <Compass size={20} strokeWidth={1.8} />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-teal-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-[19px] font-semibold tracking-tight text-ink">
              {t('app.name')}
            </h1>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
              {t('app.workspace')}
            </span>
          </div>
          <p className="max-w-[42vw] truncate text-[11px] text-muted sm:max-w-sm">
            {course ? course.name : t('app.tagline')}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] md:inline-flex ${
            searchConfigured
              ? 'border-teal-700/20 bg-teal-50 text-teal-800'
              : 'border-line bg-white/60 text-muted'
          }`}
          title={searchConfigured ? t('settings.searchConfigured') : t('chat.webNotConfigured')}
        >
          <Globe2 size={11} />
          {searchConfigured ? t('app.searchReady') : t('app.searchMissing')}
        </span>

        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white/75 px-2 py-1.5 text-xs shadow-sm">
          <Globe2 size={14} className="text-muted" />
          <span className="hidden text-[10px] font-semibold text-muted sm:inline">
            {t('language.switchLabel')}
          </span>
          <select
            aria-label={t('a11y.switchLanguage')}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            className="cursor-pointer bg-transparent pr-1 text-[12px] font-semibold text-ink focus:outline-none"
          >
            <option value="en">{t('language.english')}</option>
            <option value="zh">{t('language.chinese')}</option>
          </select>
        </label>

        <button
          type="button"
          className="btn-secondary h-8 gap-1.5 px-2.5"
          onClick={onOpenSettings}
          aria-label={t('a11y.openSettings')}
          title={t('nav.settingsTooltip')}
        >
          <Settings2 size={15} />
          <span className="hidden text-xs sm:inline">{t('nav.settings')}</span>
        </button>
      </div>
    </header>
  );
}
