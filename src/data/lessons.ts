import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { saveUnique, type SaveResult } from './database';

export type Lesson = {
  id: string;
  subjectId: string;
  number: number;
};

export async function listLessons(db: SQLiteDatabase, subjectId: string): Promise<Lesson[]> {
  return db.getAllAsync<Lesson>(
    `SELECT id, subject_id AS subjectId, number
     FROM lessons
     WHERE subject_id = ? AND deleted_at IS NULL
     ORDER BY number`,
    subjectId,
  );
}

export async function addLesson(db: SQLiteDatabase, subjectId: string, number: number): Promise<SaveResult> {
  const now = Date.now();
  return saveUnique(() =>
    db.runAsync(
      'INSERT INTO lessons (id, subject_id, number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      randomUUID(),
      subjectId,
      number,
      now,
      now,
    ),
  );
}

export async function deleteLesson(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    'UPDATE lessons SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    now,
    now,
    id,
  );
}
