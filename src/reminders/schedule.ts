import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { listStudyQuestions } from '@/data/questions';
import { getSettings, prayerSettings } from '@/data/settings';
import { reminderTimes } from '@/engine/reminders';
import { t } from '@/ui/strings';

// Reminders are local notifications scheduled ahead, so they fire with the
// phone offline. Each reschedule replaces them all, for the next few days.
const DAYS_AHEAD = 3;
const DAY = 24 * 60 * 60 * 1000;
const CHANNEL_ID = 'reminders';
const KIND = 'reminder';

// Where tapping a Reminder goes (read in the root layout).
export const REMINDER_URL = '/review' as const;

// Android shows nothing, and does not ask for the notification permission,
// until a channel exists.
async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t.remindersChannel,
    importance: AndroidImportance.HIGH,
  });
}

// Asks once; Android keeps the answer, so later calls return it silently.
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function reschedule(db: SQLiteDatabase): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );

  const settings = prayerSettings(await getSettings(db));
  if (settings === null) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();

  const now = new Date();
  const range = { from: now, to: new Date(now.getTime() + DAYS_AHEAD * DAY) };
  for (const reminder of reminderTimes(settings, range, await listStudyQuestions(db))) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t.reminderTitle,
        body: t.reminderBody(reminder.prayer),
        data: { kind: KIND, url: REMINDER_URL },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL_ID },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

// Replaces the scheduled Reminders with fresh ones. Calls run one after
// another, so two reschedules never interleave their cancels and schedules.
// Failures are logged, not thrown: a missed reschedule is retried on the
// next app open or background run.
export function rescheduleReminders(db: SQLiteDatabase): Promise<void> {
  queue = queue
    .then(() => reschedule(db))
    .catch((error) => console.warn('Rescheduling Reminders failed', error));
  return queue;
}
