import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../lib/errors.js';
import { nowIso } from '../db.js';
import type { DocumentStatus } from '../types.js';
import { touchCourse } from './course-service.js';

export interface DocumentRecord {
  id: string;
  courseId: string;
  filename: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  status: DocumentStatus;
  errorCode: string | null;
  errorMessage: string | null;
  warningCode: string | null;
  warningPages: number[];
  outlineModelId: string | null;
  outlineModelName: string | null;
  uploadedAt: string;
  updatedAt: string;
}

export function createDocumentWithLecture(
  db: DatabaseSync,
  input: {
    id: string;
    courseId: string;
    filename: string;
    storedPath: string;
    mimeType: string;
    sizeBytes: number;
    lectureTitle: string;
    outlineModelId?: string | null;
    outlineModelName?: string | null;
  },
): { documentId: string; lectureId: string } {
  const timestamp = nowIso();
  const lectureId = crypto.randomUUID();
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM lectures WHERE course_id = ?')
    .get(input.courseId) as { max_order: number };
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO documents
        (id, course_id, filename, stored_path, mime_type, size_bytes, page_count, status, error_code,
         error_message, warning_code, warning_pages, outline_model_id, outline_model_name, uploaded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'queued', NULL, NULL, NULL, '[]', ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.courseId,
      input.filename,
      input.storedPath,
      input.mimeType,
      input.sizeBytes,
      input.outlineModelId ?? null,
      input.outlineModelName ?? null,
      timestamp,
      timestamp,
    );
    db.prepare(
      `INSERT INTO lectures
        (id, course_id, document_id, sort_order, title, generation_method, auto_generated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pages', 1, ?, ?)`,
    ).run(
      lectureId,
      input.courseId,
      input.id,
      Number(maxOrder.max_order) + 1,
      input.lectureTitle,
      timestamp,
      timestamp,
    );
    touchCourse(db, input.courseId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { documentId: input.id, lectureId };
}

export function getDocument(db: DatabaseSync, documentId: string): DocumentRecord {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  return mapDocument(row);
}

export function listDocuments(db: DatabaseSync, courseId: string): DocumentRecord[] {
  const rows = db
    .prepare('SELECT * FROM documents WHERE course_id = ? ORDER BY uploaded_at ASC')
    .all(courseId) as Array<Record<string, unknown>>;
  return rows.map(mapDocument);
}

export function updateDocumentStatus(
  db: DatabaseSync,
  documentId: string,
  status: DocumentStatus,
  options: {
    errorCode?: string | null;
    errorMessage?: string | null;
    pageCount?: number | null;
    warningCode?: string | null;
    warningPages?: number[];
  } = {},
): void {
  db.prepare(
    `UPDATE documents
       SET status = ?, error_code = ?, error_message = ?, page_count = COALESCE(?, page_count),
           warning_code = ?, warning_pages = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    status,
    options.errorCode ?? null,
    options.errorMessage ?? null,
    options.pageCount ?? null,
    options.warningCode ?? null,
    JSON.stringify(options.warningPages ?? []),
    nowIso(),
    documentId,
  );
}

export function deleteDocument(db: DatabaseSync, documentId: string): { storedPath: string; courseId: string } {
  const document = getDocument(db, documentId);
  db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
  touchCourse(db, document.courseId);
  return { storedPath: document.storedPath, courseId: document.courseId };
}

export function resetDocumentForRetry(db: DatabaseSync, documentId: string): DocumentRecord {
  const document = getDocument(db, documentId);
  updateDocumentStatus(db, documentId, 'queued');
  return { ...document, status: 'queued', errorCode: null, errorMessage: null };
}

export function updateLectureTitle(db: DatabaseSync, lectureId: string, title: string): void {
  const result = db.prepare('UPDATE lectures SET title = ?, updated_at = ? WHERE id = ?').run(
    title.trim(),
    nowIso(),
    lectureId,
  );
  if (Number(result.changes) === 0) {
    throw new ApiError(404, 'LECTURE_NOT_FOUND', 'Lecture not found.');
  }
  const lecture = db.prepare('SELECT course_id FROM lectures WHERE id = ?').get(lectureId) as {
    course_id: string;
  };
  touchCourse(db, lecture.course_id);
}

export function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    filename: String(row.filename),
    storedPath: String(row.stored_path),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    pageCount: row.page_count === null ? null : Number(row.page_count),
    status: String(row.status) as DocumentStatus,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    warningCode: row.warning_code ? String(row.warning_code) : null,
    warningPages: safeParseNumberArray(row.warning_pages),
    outlineModelId: row.outline_model_id ? String(row.outline_model_id) : null,
    outlineModelName: row.outline_model_name ? String(row.outline_model_name) : null,
    uploadedAt: String(row.uploaded_at),
    updatedAt: String(row.updated_at),
  };
}

function safeParseNumberArray(value: unknown): number[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return 'Untitled lecture';
  return base.replace(/^(lecture\s+\d+)\s+/i, '$1: ');
}
