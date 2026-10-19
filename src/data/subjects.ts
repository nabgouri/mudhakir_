import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type Subject = {
  id: string;
  name: string;
  lessonCount: number;
};

export type SaveResult = { ok: true } | { ok: false; reason: 'duplicate' };

export async function listSubjects(db: SQLiteDatabase): Promise<Subject[]> {
  return db.getAllAsync<Subject>(
    `SELECT s.id, s.name,
       (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id AND l.deleted_at IS NULL) AS lessonCount
     FROM subjects s
     WHERE s.deleted_at IS NULL
     ORDER BY s.created_at`,
  );
}

export async function getSubject(db: SQLiteDatabase, id: string): Promise<Subject | null> {
  return db.getFirstAsync<Subject>(
    `SELECT s.id, s.name,
       (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id AND l.deleted_at IS NULL) AS lessonCount
     FROM subjects s
     WHERE s.id = ? AND s.deleted_at IS NULL`,
    id,
  );
}

async function nameTaken(db: SQLiteDatabase, name: string, exceptId?: string): Promise<boolean> {
  const row = await db.getFirstAsync(
    'SELECT 1 FROM subjects WHERE name = ? AND deleted_at IS NULL AND id IS NOT ?',
    name,
    exceptId ?? null,
  );
  return row !== null;
}

export async function createSubject(db: SQLiteDatabase, name: string): Promise<SaveResult> {
  if (await nameTaken(db, name)) return { ok: false, reason: 'duplicate' };
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO subjects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    randomUUID(),
    name,
    now,
    now,
  );
  return { ok: true };
}

export async function renameSubject(db: SQLiteDatabase, id: string, name: string): Promise<SaveResult> {
  if (await nameTaken(db, name, id)) return { ok: false, reason: 'duplicate' };
  await db.runAsync(
    'UPDATE subjects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    name,
    Date.now(),
    id,
  );
  return { ok: true };
}

// Deleting a Subject deletes its Lessons with it.
export async function deleteSubject(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
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
