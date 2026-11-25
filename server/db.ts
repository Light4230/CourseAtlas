import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  page_count INTEGER,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  warning_code TEXT,
  warning_pages TEXT NOT NULL DEFAULT '[]',
  outline_model_id TEXT,
  outline_model_name TEXT,
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id);

CREATE TABLE IF NOT EXISTS lectures (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  generation_method TEXT NOT NULL DEFAULT 'pages',
  outline_model_name TEXT,
  outline_warning TEXT,
  auto_generated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lectures_course ON lectures(course_id);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  summary_en TEXT,
  summary_zh TEXT,
  kind TEXT NOT NULL DEFAULT 'point',
  level INTEGER NOT NULL DEFAULT 0,
  keywords TEXT NOT NULL DEFAULT '[]',
  source_refs TEXT NOT NULL DEFAULT '[]',
  auto_generated INTEGER NOT NULL DEFAULT 1,
  manually_edited INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_lecture ON topics(lecture_id);
CREATE INDEX IF NOT EXISTS idx_topics_course ON topics(course_id);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_course ON chunks(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_lecture ON chunks(lecture_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_type TEXT NOT NULL,
  model_display_name TEXT NOT NULL,
  model_id TEXT,
  retrieved_chunks TEXT NOT NULL DEFAULT '[]',
  search_results TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  retrieval_trace TEXT NOT NULL DEFAULT '{}',
  feedback TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_course ON chat_messages(course_id, created_at);

CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_id TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  high_threshold REAL NOT NULL,
  allow_model_fallback INTEGER NOT NULL,
  enable_web_search INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function openDatabase(databasePath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrateAdditiveSchema(db);
  db.prepare(
    `INSERT OR IGNORE INTO settings (id, high_threshold, allow_model_fallback, enable_web_search, updated_at)
     VALUES (1, 0.45, 1, 0, ?)`,
  ).run(new Date().toISOString());
  // Documents cannot survive a restart of an in-process queue. Mark them retryable
  // rather than claiming processing is still running.
  db.prepare(
    `UPDATE documents
       SET status = 'failed', error_code = 'INTERRUPTED', error_message = 'Processing was interrupted by a server restart.',
           updated_at = ?
     WHERE status IN ('queued', 'parsing', 'outlining')`,
  ).run(new Date().toISOString());
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function migrateAdditiveSchema(db: DatabaseSync): void {
  addColumnIfMissing(db, 'documents', 'outline_model_id', 'TEXT');
  addColumnIfMissing(db, 'documents', 'outline_model_name', 'TEXT');
  addColumnIfMissing(db, 'lectures', 'outline_model_name', 'TEXT');
  addColumnIfMissing(db, 'lectures', 'outline_warning', 'TEXT');
  addColumnIfMissing(db, 'topics', 'summary_en', 'TEXT');
  addColumnIfMissing(db, 'topics', 'summary_zh', 'TEXT');
  addColumnIfMissing(db, 'topics', 'kind', "TEXT NOT NULL DEFAULT 'point'");
  addColumnIfMissing(db, 'topics', 'level', 'INTEGER NOT NULL DEFAULT 0');
}

function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
