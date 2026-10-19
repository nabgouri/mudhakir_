import * as BackgroundTask from 'expo-background-task';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { DATABASE_NAME, migrate } from '@/data/database';
import { syncNow } from '@/sync/sync';

import { rescheduleReminders } from './schedule';

// A periodic background run that syncs with the cloud and keeps Reminders
// scheduled for the next few days when the app is not opened. Android
// decides when it runs, so this is best effort; opening the app also syncs
// and reschedules.
const TASK_NAME = 'reschedule-reminders';
const EVERY_FEW_HOURS = 4 * 60;

// Must run when this module loads, at the top level of the app, so the task
// exists when Android starts the app in the background to run it.
TaskManager.defineTask(TASK_NAME, async () => {
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    await migrate(db);
    await syncNow(db);
    await rescheduleReminders(db);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('Background reschedule failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await db.closeAsync();
  }
});

export async function registerBackgroundReschedule(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK_NAME)) return;
  await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: EVERY_FEW_HOURS });
}
