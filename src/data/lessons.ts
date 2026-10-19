import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { saveIfUnique, writeTransaction, type SaveResult } from './database';

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
  return saveIfUnique(
    db,
    async (tx) =>
      (await tx.getFirstAsync(
        'SELECT 1 FROM lessons WHERE subject_id = ? AND number = ? AND deleted_at IS NULL',
        subjectId,
        number,
      )) !== null,
    (tx) =>
      tx.runAsync(
        'INSERT INTO lessons (id, subject_id, number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        randomUUID(),
        subjectId,
        number,
        now,
        now,
      ),
  );
}

export async function getLesson(db: SQLiteDatabase, id: string): Promise<(Lesson & { subjectName: string }) | null> {
  return db.getFirstAsync<Lesson & { subjectName: string }>(
    `SELECT l.id, l.subject_id AS subjectId, l.number, s.name AS subjectName
     FROM lessons l JOIN subjects s ON s.id = l.subject_id
     WHERE l.id = ? AND l.deleted_at IS NULL AND s.deleted_at IS NULL`,
    id,
  );
}

// Deleting a Lesson deletes its Questions with it. Their Reviews stay, since
// Reviews are append-only.
export async function deleteLesson(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      'UPDATE questions SET deleted_at = ?, updated_at = MAX(?, updated_at + 1) WHERE lesson_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await tx.runAsync(
      'UPDATE lessons SET deleted_at = ?, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
}
