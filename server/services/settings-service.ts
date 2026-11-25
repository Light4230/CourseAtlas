import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db.js';

export interface AppSettings {
  highThreshold: number;
  allowModelFallback: boolean;
  enableWebSearch: boolean;
  updatedAt: string;
}

export function getSettings(db: DatabaseSync): AppSettings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
  return {
    highThreshold: Number(row.high_threshold),
    allowModelFallback: Number(row.allow_model_fallback) === 1,
    enableWebSearch: Number(row.enable_web_search) === 1,
    updatedAt: String(row.updated_at),
  };
}

export function updateSettings(
  db: DatabaseSync,
  input: Partial<Pick<AppSettings, 'highThreshold' | 'allowModelFallback' | 'enableWebSearch'>>,
): AppSettings {
  const current = getSettings(db);
  db.prepare(
    `UPDATE settings SET high_threshold = ?, allow_model_fallback = ?, enable_web_search = ?, updated_at = ? WHERE id = 1`,
  ).run(
    input.highThreshold ?? current.highThreshold,
    (input.allowModelFallback ?? current.allowModelFallback) ? 1 : 0,
    (input.enableWebSearch ?? current.enableWebSearch) ? 1 : 0,
    nowIso(),
  );
  return getSettings(db);
}
