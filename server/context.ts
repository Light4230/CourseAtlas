import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import type { KeyStore } from './security/key-store.js';
import type { DocumentQueue } from './services/document-queue.js';

export interface AppContext {
  db: DatabaseSync;
  config: AppConfig;
  keyStore: KeyStore;
  queue: DocumentQueue;
}
