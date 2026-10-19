import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { t } from '@/ui/strings';

import { GenerateRequest } from '../../shared/generation';

import { client } from './client';

// The phone's side of question generation (docs/adr/0001). During a sync,
// Lessons waiting to be sent go to the `generate-lesson` Edge Function,
// which starts the routine; the routine writes the Questions to Supabase,
// and a later sync brings them in with the Lesson's new status.
//
// The phone never writes a Lesson's status after `waiting`: the cloud sets
// it, and the phone takes it on pull.

const CHANNEL_ID = 'questions-ready';
export const QUESTIONS_READY_KIND = 'questions-ready';

type WaitingLesson = {
  id: string;
  subjectName: string;
  number: number;
  interactiveReviewUrl: string;
};

// Sends each waiting Lesson that the cloud already has (pushed and not
// changed since). A Lesson that can't be sent stays waiting, and the next
// sync tries again; one failure doesn't stop the others.
export async function sendWaitingLessons(db: SQLiteDatabase): Promise<void> {
  const lessons = await db.getAllAsync<WaitingLesson>(
    `SELECT l.id, s.name AS subjectName, l.number, l.interactive_review_url AS interactiveReviewUrl
     FROM lessons l JOIN subjects s ON s.id = l.subject_id AND s.deleted_at IS NULL
     WHERE l.generation_status = 'waiting' AND l.deleted_at IS NULL AND l.interactive_review_url IS NOT NULL
       AND l.synced_updated_at IS l.updated_at
     ORDER BY l.created_at`,
  );
  for (const lesson of lessons) {
    const request = GenerateRequest.safeParse({
      lessonId: lesson.id,
      subjectName: lesson.subjectName,
      lessonNumber: lesson.number,
      interactiveReviewUrl: lesson.interactiveReviewUrl,
      partIndex: 0,
      partCount: 1,
    });
    if (!request.success) {
      console.warn('A waiting Lesson does not make a valid request', lesson.id, request.error);
      continue;
    }
    const { error } = await client().functions.invoke('generate-lesson', { body: request.data });
    if (error) console.warn('Sending a Lesson for generation failed', lesson.id, error);
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
