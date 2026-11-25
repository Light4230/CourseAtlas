import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../lib/errors.js';
import { nowIso } from '../db.js';

export interface CourseSummary {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  lectureCount: number;
  topicCount: number;
  lastActivityAt: string | null;
}

const COURSE_COLORS = ['#0d746b', '#2457c5', '#9a3412', '#6d3bbf', '#3f6212', '#a21caf'];

export function listCourses(db: DatabaseSync): CourseSummary[] {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM documents d WHERE d.course_id = c.id) AS document_count,
        (SELECT COUNT(*) FROM lectures l WHERE l.course_id = c.id) AS lecture_count,
        (SELECT COUNT(*) FROM topics t WHERE t.course_id = c.id) AS topic_count,
        (SELECT MAX(d.uploaded_at) FROM documents d WHERE d.course_id = c.id) AS last_activity_at
       FROM courses c
       ORDER BY c.updated_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapCourse);
}

export function getCourse(db: DatabaseSync, courseId: string): CourseSummary {
  const rows = listCourses(db);
  const course = rows.find((item) => item.id === courseId);
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course not found.');
  return course;
}

export function createCourse(
  db: DatabaseSync,
  input: { name: string; color?: string },
): CourseSummary {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const color = input.color ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)];
  db.prepare(
    `INSERT INTO courses (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.name.trim(), color, timestamp, timestamp);
  return getCourse(db, id);
}

export function updateCourse(
  db: DatabaseSync,
  courseId: string,
  input: { name?: string; color?: string },
): CourseSummary {
  getCourse(db, courseId);
  const updates: string[] = [];
  const params: Array<string | number> = [];
  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name.trim());
  }
  if (input.color !== undefined) {
    updates.push('color = ?');
    params.push(input.color);
  }
  if (updates.length === 0) return getCourse(db, courseId);
  updates.push('updated_at = ?');
  params.push(nowIso(), courseId);
  db.prepare(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getCourse(db, courseId);
}

export function deleteCourse(db: DatabaseSync, courseId: string): string[] {
  getCourse(db, courseId);
  const files = db
    .prepare('SELECT stored_path FROM documents WHERE course_id = ?')
    .all(courseId) as Array<{ stored_path: string }>;
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
  return files.map((file) => file.stored_path);
}

export function touchCourse(db: DatabaseSync, courseId: string): void {
  db.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').run(nowIso(), courseId);
}

export function removeFiles(uploadsDir: string, storedPaths: string[]): void {
  for (const storedPath of storedPaths) {
    const resolved = path.resolve(uploadsDir, storedPath);
    const root = path.resolve(uploadsDir);
    if (!resolved.startsWith(root + path.sep)) continue;
    try {
      if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    } catch {
      // A missing runtime file should not block metadata deletion.
    }
  }
}

function mapCourse(row: Record<string, unknown>): CourseSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    documentCount: Number(row.document_count ?? 0),
    lectureCount: Number(row.lecture_count ?? 0),
    topicCount: Number(row.topic_count ?? 0),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}
