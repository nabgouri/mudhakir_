import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { t } from '@/ui/strings';

import { GenerateRequest } from '../../shared/generation';

import { client } from './client';

// The phone's side of question generation (docs/adr/0001). During a sync,
// each queued part of a Lesson (`lesson_parts`, src/data/lessons.ts) goes to
// the `generate-lesson` Edge Function, which starts the routine for it; the
// routine writes the part's Questions to Supabase, and a later sync brings
// them in with the Lesson's new status.
//
// The phone never writes a Lesson's status after `waiting`: the cloud sets
// it, and the phone takes it on pull. A part's Transcript text leaves the
// phone only in its request, and is deleted here once the cloud has the
// part: it is never stored in Supabase or the backup.

const CHANNEL_ID = 'questions-ready';
export const QUESTIONS_READY_KIND = 'questions-ready';

type QueuedPart = {
  lessonId: string;
  partIndex: number;
  transcriptText: string | null;
  subjectName: string;
  number: number;
  interactiveReviewUrl: string | null;
  partCount: number;
};

function httpStatus(error: unknown): number | undefined {
  const context = (error as { context?: unknown }).context;
  return context instanceof Response ? context.status : undefined;
}

// Sends each queued part of a Lesson the cloud already has (pushed and not
// changed since). A part that can't be sent stays queued, and the next sync
// tries again; one failure doesn't stop the others, except the routine's
// hourly limit, which stops this sync's sending.
export async function sendQueuedParts(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    'DELETE FROM lesson_parts WHERE lesson_id IN (SELECT id FROM lessons WHERE deleted_at IS NOT NULL)',
  );
  const parts = await db.getAllAsync<QueuedPart>(
    `SELECT p.lesson_id AS lessonId, p.part_index AS partIndex, p.transcript_text AS transcriptText,
       s.name AS subjectName, l.number, l.interactive_review_url AS interactiveReviewUrl, l.part_count AS partCount
     FROM lesson_parts p
     JOIN lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL
     JOIN subjects s ON s.id = l.subject_id AND s.deleted_at IS NULL
     WHERE l.synced_updated_at IS l.updated_at
     ORDER BY l.created_at, p.part_index`,
  );
  for (const part of parts) {
    const request = GenerateRequest.safeParse({
      lessonId: part.lessonId,
      subjectName: part.subjectName,
      lessonNumber: part.number,
      // Only the first part reads the Interactive Review.
      interactiveReviewUrl: part.partIndex === 0 ? (part.interactiveReviewUrl ?? undefined) : undefined,
      transcriptText: part.transcriptText ?? undefined,
      partIndex: part.partIndex,
      partCount: part.partCount,
    });
    if (!request.success) {
      console.warn('A queued part does not make a valid request', part.lessonId, part.partIndex, request.error);
      continue;
    }
    const { error } = await client().functions.invoke('generate-lesson', { body: request.data });
    if (error) {
      console.warn('Sending a part for generation failed', part.lessonId, part.partIndex, error);
      if (httpStatus(error) === 429) return;
      continue;
    }
    // Sent, already under way or already done: the cloud has it.
    await db.runAsync(
      'DELETE FROM lesson_parts WHERE lesson_id = ? AND part_index = ?',
      part.lessonId,
      part.partIndex,
    );
  }
}

// The Lessons whose Questions haven't arrived yet, read before a pull so
// the ones that become ready can be told apart.
export async function lessonsAwaitingQuestions(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM lessons WHERE generation_status IN ('waiting', 'generating', 'failed') AND deleted_at IS NULL`,
  );
  return new Set(rows.map((row) => row.id));
}

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t.questionsReadyChannel,
    importance: AndroidImportance.DEFAULT,
  });
}

// Shows a "Questions ready" notification for each of `awaiting` that a pull
// made ready. Without the notification permission nothing shows; the
// Lesson's status still says ready.
export async function notifyQuestionsReady(db: SQLiteDatabase, awaiting: Set<string>): Promise<void> {
  if (awaiting.size === 0) return;
  const ready = await db.getAllAsync<{ id: string; subjectName: string; number: number; questionCount: number }>(
    `SELECT l.id, s.name AS subjectName, l.number,
       (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id AND q.deleted_at IS NULL) AS questionCount
     FROM lessons l JOIN subjects s ON s.id = l.subject_id AND s.deleted_at IS NULL
     WHERE l.generation_status = 'ready' AND l.deleted_at IS NULL`,
  );
  const arrived = ready.filter((lesson) => awaiting.has(lesson.id));
  if (arrived.length === 0 || !(await Notifications.getPermissionsAsync()).granted) return;

  await ensureChannel();
  for (const lesson of arrived) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t.questionsReadyTitle,
        body: t.questionsReadyBody(lesson.subjectName, lesson.number, lesson.questionCount),
        data: { kind: QUESTIONS_READY_KIND, lessonId: lesson.id },
      },
      trigger: { channelId: CHANNEL_ID },
    });
  }
}
