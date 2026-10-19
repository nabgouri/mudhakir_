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

// Asks for the notification permission when it is not yet granted. Android
// stops showing the prompt after the student refuses it twice.
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// New Reminders are scheduled before stale ones are cancelled, so a reschedule
// cut short (the app killed mid-way) never leaves the student with none. A
// Reminder's identifier is its fire time, so scheduling it again replaces it.
async function reschedule(db: SQLiteDatabase): Promise<void> {
  const settings = prayerSettings(await getSettings(db));
  const now = new Date();
  const range = { from: now, to: new Date(now.getTime() + DAYS_AHEAD * DAY) };
  const reminders =
    settings !== null && (await Notifications.getPermissionsAsync()).granted
      ? reminderTimes(settings, range, await listStudyQuestions(db))
      : [];
  const wanted = new Set(reminders.map((reminder) => `${KIND}-${reminder.at.getTime()}`));

  if (reminders.length > 0) await ensureChannel();
  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${KIND}-${reminder.at.getTime()}`,
      content: {
        title: t.reminderTitle,
        body: t.reminderBody(reminder.prayer),
        data: { kind: KIND, url: REMINDER_URL },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL_ID },
    });
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === KIND && !wanted.has(request.identifier))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
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
