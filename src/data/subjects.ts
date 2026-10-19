import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { saveUnique, type SaveResult } from './database';

export type Subject = {
  id: string;
  name: string;
  lessonCount: number;
};

const SELECT_SUBJECT = `
  SELECT s.id, s.name,
    (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id AND l.deleted_at IS NULL) AS lessonCount
  FROM subjects s
  WHERE s.deleted_at IS NULL`;

export async function listSubjects(db: SQLiteDatabase): Promise<Subject[]> {
  return db.getAllAsync<Subject>(`${SELECT_SUBJECT} ORDER BY s.created_at`);
}

export async function getSubject(db: SQLiteDatabase, id: string): Promise<Subject | null> {
  return db.getFirstAsync<Subject>(`${SELECT_SUBJECT} AND s.id = ?`, id);
}

export async function createSubject(db: SQLiteDatabase, name: string): Promise<SaveResult> {
  const now = Date.now();
  return saveUnique(() =>
    db.runAsync(
      'INSERT INTO subjects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      randomUUID(),
      name,
      now,
      now,
    ),
  );
}

export async function renameSubject(db: SQLiteDatabase, id: string, name: string): Promise<SaveResult> {
  return saveUnique(() =>
    db.runAsync(
      'UPDATE subjects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND name <> ?',
      name,
      Date.now(),
      id,
      name,
    ),
  );
}

// Deleting a Subject deletes its Lessons and their Questions with it.
export async function deleteSubject(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE questions SET deleted_at = ?, updated_at = ?
       WHERE deleted_at IS NULL AND lesson_id IN (SELECT id FROM lessons WHERE subject_id = ? AND deleted_at IS NULL)`,
      now,
      now,
      id,
    );
    await tx.runAsync(
      'UPDATE lessons SET deleted_at = ?, updated_at = ? WHERE subject_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await tx.runAsync(
      'UPDATE subjects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
}
