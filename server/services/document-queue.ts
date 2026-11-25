import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../lib/errors.js';
import { extractPdf } from '../pdf/extract.js';
import {
  clearDocumentContent,
  storeExtractedContent,
  type AiOutlineContext,
} from '../services/outline-service.js';
import { updateDocumentStatus } from '../services/document-service.js';
import { getModelWithSecret } from '../services/model-service.js';
import type { KeyStore } from '../security/key-store.js';

export class DocumentQueue {
  private chain: Promise<void> = Promise.resolve();
  private readonly queued = new Set<string>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly uploadsDir: string,
    private readonly keyStore: KeyStore,
  ) {}

  enqueue(documentId: string): void {
    if (this.queued.has(documentId)) return;
    this.queued.add(documentId);
    this.chain = this.chain
      .then(() => this.process(documentId))
      .catch((error) => {
        console.error('[courseatlas] document queue job failed:', error);
      })
      .finally(() => {
        this.queued.delete(documentId);
      });
  }

  private async process(documentId: string): Promise<void> {
    const document = this.db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .get(documentId) as Record<string, unknown> | undefined;
    if (!document) return;
    const storedPath = String(document.stored_path);
    const outlineModelId = document.outline_model_id
      ? String(document.outline_model_id)
      : null;
    try {
      updateDocumentStatus(this.db, documentId, 'parsing');
      const extracted = await extractPdf(path.resolve(this.uploadsDir, storedPath));
      updateDocumentStatus(this.db, documentId, 'outlining', {
        pageCount: extracted.pageCount,
        warningCode: extracted.emptyPages.length > 0 ? 'SOME_PAGES_NO_TEXT' : null,
        warningPages: extracted.emptyPages,
      });

      let ai: AiOutlineContext | undefined;
      let modelUnavailable = false;
      if (outlineModelId) {
        try {
          ai = {
            model: getModelWithSecret(this.db, outlineModelId),
            keyStore: this.keyStore,
          };
        } catch {
          modelUnavailable = true;
        }
      }

      await storeExtractedContent(
        this.db,
        documentId,
        extracted.pages,
        extracted.pageCount,
        extracted.emptyPages,
        ai,
      );

      if (modelUnavailable) {
        const lecture = this.db
          .prepare('SELECT id FROM lectures WHERE document_id = ?')
          .get(documentId) as { id: string } | undefined;
        if (lecture) {
          this.db
            .prepare('UPDATE lectures SET outline_warning = ? WHERE id = ?')
            .run('AI_MODEL_UNAVAILABLE', lecture.id);
        }
      }
    } catch (error) {
      clearDocumentContent(this.db, documentId);
      if (error instanceof ApiError) {
        updateDocumentStatus(this.db, documentId, 'failed', {
          errorCode: error.code,
          errorMessage: error.message,
        });
      } else {
        updateDocumentStatus(this.db, documentId, 'failed', {
          errorCode: 'PARSE_FAILED',
          errorMessage: 'The PDF could not be processed.',
        });
      }
    }
  }
}
