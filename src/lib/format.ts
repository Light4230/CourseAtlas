import type { TFunction } from 'i18next';
import type { Topic } from '../types';

export function localizedSummary(topic: Topic, language: string): string {
  if (language === 'zh' && topic.summaryZh.trim()) return topic.summaryZh;
  return topic.summaryEn || topic.summary || '';
}

export function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '';
  const locale = language === 'zh' ? 'zh-CN' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatPercent(value: number): number {
  return Math.round(value * 100);
}

export function translateError(t: TFunction, code: string | null | undefined): string {
  if (!code) return t('errors.UNKNOWN');
  const key = `errors.${code}`;
  const translated = t(key, { defaultValue: '' });
  return translated || t('errors.UNKNOWN');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
