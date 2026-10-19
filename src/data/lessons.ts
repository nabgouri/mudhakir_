import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { saveIfUnique, writeTransaction, type SaveResult } from './database';

// Where a Lesson's Questions are in being generated from its material:
// waiting to be sent, generating, ready, or failed. Null when the Lesson has
// no material to generate from.
export type GenerationStatus = 'waiting' | 'generating' | 'ready' | 'failed';

export type Lesson = {
  id: string;
  subjectId: string;
  number: number;
  interactiveReviewUrl: string | null;
  generationStatus: GenerationStatus | null;
  generationError: string | null;
};

function lessonColumns(table = 'lessons') {
  return `${table}.id, ${table}.subject_id AS subjectId, ${table}.number,
    ${table}.interactive_review_url AS interactiveReviewUrl, ${table}.generation_status AS generationStatus,
    ${table}.error AS generationError`;
}

export async function listLessons(db: SQLiteDatabase, subjectId: string): Promise<Lesson[]> {
  return db.getAllAsync<Lesson>(
    `SELECT ${lessonColumns()}
     FROM lessons
     WHERE subject_id = ? AND deleted_at IS NULL
     ORDER BY number`,
    subjectId,
  );
}

// A Lesson with an Interactive Review waits to be sent for generation; sync
// sends it once the phone is online and signed in (src/sync/generation.ts).
export async function addLesson(
  db: SQLiteDatabase,
  subjectId: string,
  number: number,
  interactiveReviewUrl?: string,
): Promise<SaveResult> {
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
        `INSERT INTO lessons (id, subject_id, number, interactive_review_url, generation_status, part_count,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        subjectId,
        number,
        interactiveReviewUrl ?? null,
        interactiveReviewUrl === undefined ? null : 'waiting',
        interactiveReviewUrl === undefined ? 0 : 1,
        now,
        now,
      ),
  );
}

export async function getLesson(db: SQLiteDatabase, id: string): Promise<(Lesson & { subjectName: string }) | null> {
  return db.getFirstAsync<Lesson & { subjectName: string }>(
    `SELECT ${lessonColumns('l')}, s.name AS subjectName
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
