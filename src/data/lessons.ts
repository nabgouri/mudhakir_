import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { lessonTranscriptParts } from '../../shared/transcript';

import { saveIfUnique, writeTransaction, type SaveResult } from './database';

// Where a Lesson's Questions are in being generated from its material:
// waiting to be sent, generating, ready, or failed. Null when the Lesson has
// no material to generate from.
export type GenerationStatus = 'waiting' | 'generating' | 'ready' | 'failed';

export type Lesson = {
  id: string;
  subjectId: string;
  number: number;
  // The Lesson Title, for a Lesson imported from the Ma'had Channel.
  title: string | null;
  // When the student studied it; null for an imported Lesson until they mark it studied.
  studiedAt: number | null;
  interactiveReviewUrl: string | null;
  // The SHA-256 of each part's Transcript text; empty without a Transcript.
  transcriptDigests: string[];
  generationStatus: GenerationStatus | null;
  generationError: string | null;
  partCount: number;
  partsDone: number[];
  failedParts: number[];
  // Parts still to be sent from this phone.
  queuedParts: number;
};

type LessonRow = Omit<Lesson, 'transcriptDigests' | 'partsDone' | 'failedParts'> & {
  transcriptDigests: string;
  partsDone: string;
  failedParts: string;
};

function lessonColumns(table = 'lessons') {
  return `${table}.id, ${table}.subject_id AS subjectId, ${table}.number, ${table}.title, ${table}.studied_at AS studiedAt,
    ${table}.interactive_review_url AS interactiveReviewUrl, ${table}.transcript_digests AS transcriptDigests,
    ${table}.generation_status AS generationStatus, ${table}.error AS generationError,
    ${table}.part_count AS partCount, ${table}.parts_done AS partsDone, ${table}.failed_parts AS failedParts,
    (SELECT COUNT(*) FROM lesson_parts p WHERE p.lesson_id = ${table}.id) AS queuedParts`;
}

function lessonFromRow<T extends LessonRow>(row: T): Omit<T, keyof LessonRow> & Lesson {
  return {
    ...row,
    transcriptDigests: JSON.parse(row.transcriptDigests) as string[],
    partsDone: JSON.parse(row.partsDone) as number[],
    failedParts: JSON.parse(row.failedParts) as number[],
  };
}

export async function listLessons(db: SQLiteDatabase, subjectId: string): Promise<Lesson[]> {
  const rows = await db.getAllAsync<LessonRow>(
    `SELECT ${lessonColumns()}
     FROM lessons
     WHERE subject_id = ? AND deleted_at IS NULL
     ORDER BY number`,
    subjectId,
  );
  return rows.map(lessonFromRow);
}


// What `transcript_digests` holds for a part: the SHA-256 of its text as
// UTF-8, in hex, as the routine's write script computes it.
function digest(text: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
}

export type LessonMaterial = { interactiveReviewUrl?: string; transcriptText?: string };

// A Lesson with an Interactive Review or a Transcript waits to be sent for
// generation: its parts are queued here, and sync sends them once the phone
// is online and signed in (src/sync/generation.ts). A Transcript is split
// into as many parts as it needs; the Interactive Review goes with the
// first.
export async function addLesson(
  db: SQLiteDatabase,
  subjectId: string,
  number: number,
  material: LessonMaterial = {},
): Promise<SaveResult> {
  const now = Date.now();
  const id = randomUUID();
  const interactiveReviewUrl = material.interactiveReviewUrl ?? null;
  const transcriptParts =
    material.transcriptText === undefined ? [] : lessonTranscriptParts({ id, number, interactiveReviewUrl }, material.transcriptText);
  const partCount = Math.max(transcriptParts.length, interactiveReviewUrl === null ? 0 : 1);
  const digests = await Promise.all(transcriptParts.map(digest));
  return saveIfUnique(
    db,
    async (tx) =>
      (await tx.getFirstAsync(
        'SELECT 1 FROM lessons WHERE subject_id = ? AND number = ? AND deleted_at IS NULL',
        subjectId,
        number,
      )) !== null,
    async (tx) => {
      await tx.runAsync(
        // Added by hand, so studied now.
        `INSERT INTO lessons (id, subject_id, number, interactive_review_url, transcript_digests, generation_status,
           part_count, studied_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        subjectId,
        number,
        interactiveReviewUrl,
        JSON.stringify(digests),
        partCount === 0 ? null : 'waiting',
        partCount,
        now,
        now,
        now,
      );
      for (let partIndex = 0; partIndex < partCount; partIndex++) {
        await tx.runAsync(
          'INSERT INTO lesson_parts (lesson_id, part_index, transcript_text) VALUES (?, ?, ?)',
          id,
          partIndex,
          transcriptParts[partIndex] ?? null,
        );
      }
    },
  );
}

// The parts a retry sends again: the failed ones, or, for a Lesson still
// waiting with nothing queued on this phone (it was added on another phone,
// or before a reinstall), every part not done.
export function partsToRetry(lesson: Lesson): number[] {
  if (lesson.generationStatus === 'failed') return lesson.failedParts;
  if (lesson.generationStatus === 'waiting' && lesson.queuedParts === 0) {
    return Array.from({ length: lesson.partCount }, (_, i) => i).filter((i) => !lesson.partsDone.includes(i));
  }
  return [];
}

export type RetryResult =
  | { status: 'queued' }
  // The Transcript's text was sent and is no longer on the phone.
  | { status: 'needs-transcript' }
  // The re-attached PDF is not the Lesson's Transcript: its parts' digests
  // differ.
  | { status: 'different-transcript' }
  | { status: 'nothing-to-retry' };

// Queues `partsToRetry` to be sent again, each with its Transcript text
// when the Lesson has a Transcript. The text comes from the queue when the
// part is still there, else from `transcriptText`, the re-attached PDF's,
// once each part it supplies matches the digest stored when the Lesson was
// added.
// The routine replaces a part's Questions when it runs again, so a retry
// never duplicates them.
export async function queueRetry(db: SQLiteDatabase, lessonId: string, transcriptText?: string): Promise<RetryResult> {
  let result: RetryResult = { status: 'nothing-to-retry' };
  await writeTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<LessonRow>(
      `SELECT ${lessonColumns()} FROM lessons WHERE id = ? AND deleted_at IS NULL`,
      lessonId,
    );
    if (row === null) return;
    const lesson = lessonFromRow(row);
    const parts = partsToRetry(lesson);
    if (parts.length === 0) return;

    const queued = new Set(
      (
        await tx.getAllAsync<{ partIndex: number }>(
          'SELECT part_index AS partIndex FROM lesson_parts WHERE lesson_id = ? AND transcript_text IS NOT NULL',
          lessonId,
        )
      ).map((part) => part.partIndex),
    );
    const hasTranscript = lesson.transcriptDigests.length > 0;
    const missing = hasTranscript ? parts.filter((part) => !queued.has(part)) : [];
    let texts: string[] = [];
    if (missing.length > 0) {
      if (transcriptText === undefined) {
        result = { status: 'needs-transcript' };
        return;
      }
      texts = lessonTranscriptParts(lesson, transcriptText);
      const digests = await Promise.all(missing.map((part) => (texts[part] === undefined ? '' : digest(texts[part]))));
      if (texts.length !== lesson.partCount || missing.some((part, i) => digests[i] !== lesson.transcriptDigests[part])) {
        result = { status: 'different-transcript' };
        return;
      }
    }
    for (const part of parts) {
      if (queued.has(part)) continue;
      await tx.runAsync(
        'INSERT OR REPLACE INTO lesson_parts (lesson_id, part_index, transcript_text) VALUES (?, ?, ?)',
        lessonId,
        part,
        hasTranscript ? texts[part] : null,
      );
    }
    result = { status: 'queued' };
  });
  return result;
}

export async function getLesson(db: SQLiteDatabase, id: string): Promise<(Lesson & { subjectName: string }) | null> {
  const row = await db.getFirstAsync<LessonRow & { subjectName: string }>(
    `SELECT ${lessonColumns('l')}, s.name AS subjectName
     FROM lessons l JOIN subjects s ON s.id = l.subject_id
     WHERE l.id = ? AND l.deleted_at IS NULL AND s.deleted_at IS NULL`,
    id,
  );
  return row === null ? null : lessonFromRow(row);
}

// The student has studied the Lesson: it, and every earlier unstudied Lesson
// of its Subject, become Studied Lessons, so their new Questions start being
// introduced (docs/adr/0002). One tap catches up a backlog.
export async function markStudied(db: SQLiteDatabase, lesson: { subjectId: string; number: number }): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `UPDATE lessons SET studied_at = ?, updated_at = MAX(?, updated_at + 1)
     WHERE subject_id = ? AND number <= ? AND studied_at IS NULL AND deleted_at IS NULL`,
    now,
    now,
    lesson.subjectId,
    lesson.number,
  );
}

// Deleting a Lesson deletes its Questions with it, and any Transcript text
// not yet sent. Their Reviews stay, since Reviews are append-only.
export async function deleteLesson(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM lesson_parts WHERE lesson_id = ?', id);
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
