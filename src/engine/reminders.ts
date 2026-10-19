// When Reminders fire: shortly after each of the five daily prayers, on days
// when something will be due. Part of the study engine: pure, no I/O.
// Prayer times come from the `adhan` library, calculated for the phone's
// local calendar days, so they need no network.
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';

import { due, type Limits, type StudyQuestion } from './study';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

// adhan's methods, less `Other`, which has no angles of its own.
export const CALCULATION_METHODS = [
  'MuslimWorldLeague',
  'Egyptian',
  'Karachi',
  'UmmAlQura',
  'Dubai',
  'MoonsightingCommittee',
  'NorthAmerica',
  'Kuwait',
  'Qatar',
  'Singapore',
  'Tehran',
  'Turkey',
] as const satisfies readonly (keyof typeof CalculationMethod)[];
export type CalculationMethodName = (typeof CALCULATION_METHODS)[number];

export const DEFAULT_DELAY_MINUTES = 15;

export type PrayerSettings = {
  latitude: number;
  longitude: number;
  method: CalculationMethodName;
  // Minutes after the adhan.
  delayMinutes: number;
  prayers: Record<Prayer, boolean>;
};

export type Reminder = { prayer: Prayer; at: Date };

// `to` is included, `from` is not: a Reminder at `from` has already fired.
export type DateRange = { from: Date; to: Date };

const MINUTE = 60 * 1000;

// The Reminders that fire within `range`, in time order: each prayer turned
// on, plus the delay. A Reminder is left out when none of `questions` would
// be due at its time; that is a prediction from the Questions as they are
// now, since nothing can be cancelled once it is scheduled.
export function reminderTimes(
  settings: PrayerSettings,
  range: DateRange,
  questions: readonly StudyQuestion[],
  limits: Limits = {},
): Reminder[] {
  const coordinates = new Coordinates(settings.latitude, settings.longitude);
  const parameters = CalculationMethod[settings.method]();
  const reminders: Reminder[] = [];

  // The delay can push a Reminder past midnight, so start a day early.
  const day = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate() - 1);
  while (day.getTime() <= range.to.getTime()) {
    const times = new PrayerTimes(coordinates, day, parameters);
    for (const prayer of PRAYERS) {
      if (!settings.prayers[prayer]) continue;
      const at = new Date(times[prayer].getTime() + settings.delayMinutes * MINUTE);
      if (at > range.from && at <= range.to && due(questions, at, {}, limits).length > 0) {
        reminders.push({ prayer, at });
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return reminders;
}
