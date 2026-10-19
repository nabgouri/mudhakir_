import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { saveIfUnique, writeTransaction, type SaveResult } from './database';

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

async function nameTaken(db: SQLiteDatabase, name: string, exceptId: string | null): Promise<boolean> {
  const row = await db.getFirstAsync(
    'SELECT 1 FROM subjects WHERE name = ? AND id IS NOT ? AND deleted_at IS NULL',
    name,
    exceptId,
  );
  return row !== null;
}

export async function createSubject(db: SQLiteDatabase, name: string): Promise<SaveResult> {
  const now = Date.now();
  return saveIfUnique(
    db,
    (tx) => nameTaken(tx, name, null),
    (tx) =>
      tx.runAsync(
        'INSERT INTO subjects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        randomUUID(),
        name,
        now,
        now,
      ),
  );
}

export async function renameSubject(db: SQLiteDatabase, id: string, name: string): Promise<SaveResult> {
  return saveIfUnique(
    db,
    (tx) => nameTaken(tx, name, id),
    (tx) =>
      tx.runAsync(
        'UPDATE subjects SET name = ?, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND deleted_at IS NULL AND name <> ?',
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
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      `UPDATE questions SET deleted_at = ?, updated_at = MAX(?, updated_at + 1)
       WHERE deleted_at IS NULL AND lesson_id IN (SELECT id FROM lessons WHERE subject_id = ? AND deleted_at IS NULL)`,
      now,
      now,
      id,
    );
    await tx.runAsync(
      'UPDATE lessons SET deleted_at = ?, updated_at = MAX(?, updated_at + 1) WHERE subject_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await tx.runAsync(
      'UPDATE subjects SET deleted_at = ?, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
}
