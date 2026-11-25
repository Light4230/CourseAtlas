import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../lib/errors.js';
import { nowIso } from '../db.js';
import { KeyStore, maskApiKey } from '../security/key-store.js';

export type ModelProvider = 'deepseek' | 'openai-compatible';

export interface PublicModel {
  id: string;
  displayName: string;
  provider: ModelProvider;
  baseUrl: string;
  modelId: string;
  maskedKey: string;
}

export interface ModelWithSecret {
  id: string;
  displayName: string;
  provider: ModelProvider;
  baseUrl: string;
  modelId: string;
  apiKeyEncrypted: string;
  iv: string;
  authTag: string;
  keyHint: string;
}

export function listModels(db: DatabaseSync): PublicModel[] {
  const rows = db.prepare('SELECT * FROM model_configs ORDER BY created_at ASC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map(mapPublicModel);
}

export function createModel(
  db: DatabaseSync,
  keyStore: KeyStore,
  input: {
    displayName: string;
    provider: ModelProvider;
    baseUrl: string;
    modelId: string;
    apiKey: string;
  },
  options: { allowLocalModels: boolean },
): PublicModel {
  const baseUrl = normaliseBaseUrl(input.baseUrl, options.allowLocalModels);
  const encrypted = keyStore.encrypt(input.apiKey.trim());
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO model_configs
      (id, display_name, provider, base_url, model_id, api_key_ciphertext, iv, auth_tag, key_hint, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.displayName.trim(),
    input.provider,
    baseUrl,
    input.modelId.trim(),
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    maskApiKey(input.apiKey),
    createdAt,
  );
  return {
    id,
    displayName: input.displayName.trim(),
    provider: input.provider,
    baseUrl,
    modelId: input.modelId.trim(),
    maskedKey: maskApiKey(input.apiKey),
  };
}

export function deleteModel(db: DatabaseSync, modelId: string): void {
  const result = db.prepare('DELETE FROM model_configs WHERE id = ?').run(modelId);
  if (Number(result.changes) === 0) {
    throw new ApiError(404, 'MODEL_NOT_FOUND', 'Model configuration not found.');
  }
}

export function getModelWithSecret(db: DatabaseSync, modelId: string): ModelWithSecret {
  const row = db.prepare('SELECT * FROM model_configs WHERE id = ?').get(modelId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ApiError(404, 'MODEL_NOT_FOUND', 'Model configuration not found.');
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    provider: String(row.provider) as ModelProvider,
    baseUrl: String(row.base_url),
    modelId: String(row.model_id),
    apiKeyEncrypted: String(row.api_key_ciphertext),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyHint: String(row.key_hint),
  };
}

export function decryptModelKey(keyStore: KeyStore, model: ModelWithSecret): string {
  try {
    return keyStore.decrypt({
      ciphertext: model.apiKeyEncrypted,
      iv: model.iv,
      authTag: model.authTag,
    });
  } catch {
    throw new ApiError(
      500,
      'LLM_REQUEST_FAILED',
      'The saved API key could not be decrypted. Re-import the model configuration.',
    );
  }
}

function mapPublicModel(row: Record<string, unknown>): PublicModel {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    provider: String(row.provider) as ModelProvider,
    baseUrl: String(row.base_url),
    modelId: String(row.model_id),
    maskedKey: String(row.key_hint),
  };
}

function normaliseBaseUrl(raw: string, allowLocalModels: boolean): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Base URL is not a valid URL.', 'baseUrl');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Base URL must use HTTP or HTTPS.', 'baseUrl');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !(local && allowLocalModels)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Use HTTPS for remote model endpoints. Local HTTP endpoints require ALLOW_LOCAL_MODELS=true.',
      'baseUrl',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Base URL cannot contain credentials, a query, or a fragment.', 'baseUrl');
  }
  return url.toString().replace(/\/$/, '');
}
