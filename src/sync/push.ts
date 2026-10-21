import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { DATABASE_NAME, migrate } from '@/data/database';
import { rescheduleReminders } from '@/reminders/schedule';

import { client } from './client';
import { syncNow } from './sync';

// Syncing when the cloud says so (docs/setup-push.md). When a Lesson's
// Questions are ready, or generating them failed, the `notify-ready` Edge
// Function sends this phone a data-only push. That wakes this task even with
// the app closed; it syncs, which brings the Questions, shows "Questions
// ready" and reschedules Reminders. The cloud sends no other push, so the
// payload isn't read.
const TASK_NAME = 'sync-on-push';

// Must run when this module loads, at the top level of the app, so the task
// exists when a push starts the app in the background.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK_NAME, async () => {
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    await migrate(db);
    await syncNow(db);
    await rescheduleReminders(db);
  } catch (error) {
    console.warn('Syncing on a push failed', error);
  } finally {
    await db.closeAsync();
  }
});

export async function registerSyncOnPush(): Promise<void> {
  await Notifications.registerTaskAsync(TASK_NAME);
}

// Gives the cloud this phone's push token, for the signed-in account. Fails
// in a build without Firebase (google-services.json); the phone then syncs
// only when opened and from the periodic background task.
export async function registerPushToken(): Promise<void> {
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') throw new Error('The EAS project id is missing from app.json');
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await client().rpc('register_push_token', { p_token: token });
  if (error) throw error;
}
