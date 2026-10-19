import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { rate, type QuestionState, type Rating, type StudyQuestion } from '@/engine/study';

import { writeTransaction } from './database';
import type { QuestionContent } from './input';
import { questionFromRow, type Question, type QuestionRow } from './question-row';

export type { Question } from './question-row';

// A Question is live while it, its Lesson and its Subject are not deleted.
// Deleting a Lesson or Subject also marks its Questions, but the joins keep
// a half-finished deletion from showing Questions.
const FROM_LIVE_QUESTIONS = `
  FROM questions q
  JOIN lessons l ON l.id = q.lesson_id AND l.deleted_at IS NULL
  JOIN subjects s ON s.id = l.subject_id AND s.deleted_at IS NULL
  WHERE q.deleted_at IS NULL`;

const SELECT_QUESTION = `
  SELECT q.id, q.lesson_id AS lessonId, l.subject_id AS subjectId, l.number AS lessonNumber,
    q.kind, q.prompt, q.options, q.correct_option AS correctOption, q.answer,
    q.source_passage AS sourcePassage
  ${FROM_LIVE_QUESTIONS}`;

function parseSchedule(schedule: string | null): QuestionState | null {
  return schedule === null ? null : (JSON.parse(schedule) as QuestionState);
}

function contentColumns(content: QuestionContent) {
  return content.kind === 'multiple-choice'
    ? { options: JSON.stringify(content.options), correctOption: content.correctOption, answer: null }
    : { options: null, correctOption: null, answer: content.answer };
}

export async function listLessonQuestions(db: SQLiteDatabase, lessonId: string): Promise<Question[]> {
  const rows = await db.getAllAsync<QuestionRow>(`${SELECT_QUESTION} AND q.lesson_id = ? ORDER BY q.created_at`, lessonId);
  return rows.map(questionFromRow);
}

export async function getQuestion(db: SQLiteDatabase, id: string): Promise<Question | null> {
  const row = await db.getFirstAsync<QuestionRow>(`${SELECT_QUESTION} AND q.id = ?`, id);
  return row ? questionFromRow(row) : null;
}

export async function addQuestion(db: SQLiteDatabase, lessonId: string, content: QuestionContent): Promise<void> {
  const now = Date.now();
  const { options, correctOption, answer } = contentColumns(content);
  await db.runAsync(
    `INSERT INTO questions (id, lesson_id, kind, prompt, options, correct_option, answer, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    lessonId,
    content.kind,
    content.prompt,
    options,
    correctOption,
    answer,
    now,
    now,
  );
}

// `edited` records that the student changed the Question, so a later
// generation run can leave it alone.
export async function updateQuestion(db: SQLiteDatabase, id: string, content: QuestionContent): Promise<void> {
  const { options, correctOption, answer } = contentColumns(content);
  await db.runAsync(
    `UPDATE questions SET kind = ?, prompt = ?, options = ?, correct_option = ?, answer = ?, edited = 1, updated_at = MAX(?, updated_at + 1)
     WHERE id = ? AND deleted_at IS NULL`,
    content.kind,
    content.prompt,
    options,
    correctOption,
    answer,
    Date.now(),
    id,
  );
}

export async function deleteQuestion(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    'UPDATE questions SET deleted_at = ?, updated_at = MAX(?, updated_at + 1) WHERE id = ? AND deleted_at IS NULL',
    now,
    now,
    id,
  );
}

// Every live Question with what the study engine needs to schedule it.
export async function listStudyQuestions(db: SQLiteDatabase): Promise<StudyQuestion[]> {
  const rows = await db.getAllAsync<{ id: string; subjectId: string; createdAt: number; schedule: string | null }>(
    `SELECT q.id, l.subject_id AS subjectId, q.created_at AS createdAt, q.schedule ${FROM_LIVE_QUESTIONS}`,
  );
  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    createdAt: row.createdAt,
    state: parseSchedule(row.schedule),
  }));
}

// Appends the Review and stores the Question's new schedule, together. The
// schedule is derived from the Reviews, so it does not change `updated_at`.
export async function recordReview(db: SQLiteDatabase, questionId: string, rating: Rating, now: Date): Promise<void> {
  await writeTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<{ schedule: string | null }>(
      'SELECT schedule FROM questions WHERE id = ? AND deleted_at IS NULL',
      questionId,
    );
    if (!row) return;
    const state = rate(parseSchedule(row.schedule), rating, now);
    await tx.runAsync(
      'INSERT INTO reviews (id, question_id, rating, reviewed_at) VALUES (?, ?, ?, ?)',
      randomUUID(),
      questionId,
      rating,
      now.getTime(),
    );
    await tx.runAsync('UPDATE questions SET schedule = ? WHERE id = ?', JSON.stringify(state), questionId);
  });
}
