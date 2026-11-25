import { readConfig } from './config.js';
import { openDatabase } from './db.js';
import { KeyStore } from './security/key-store.js';
import { DocumentQueue } from './services/document-queue.js';
import { createApp } from './app.js';
import type { AppContext } from './context.js';

const config = readConfig();
const db = openDatabase(config.databasePath);
const keyStore = new KeyStore(config.modelKeySecret, config.secretsDir);
const queue = new DocumentQueue(db, config.uploadsDir, keyStore);
const ctx: AppContext = { db, config, keyStore, queue };
const app = createApp(ctx);

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[courseatlas] API listening on http://127.0.0.1:${config.port}`);
  console.log(
    `[courseatlas] web search: ${config.tavilyApiKey ? 'configured' : 'not configured'}; local model URLs: ${config.allowLocalModels ? 'allowed' : 'blocked'}`,
  );
});

function shutdown(): void {
  server.close(() => {
    try {
      db.close();
    } catch {
      // The process is already stopping.
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('[courseatlas] unhandled rejection:', reason);
});
