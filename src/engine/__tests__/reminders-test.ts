import { reminderTimes, type PrayerSettings, type Reminder } from '../reminders';
import { rate, type StudyQuestion } from '../study';

// Makkah, Umm al-Qura, 5 March 2016. The published times (ummulqura.org.sa,
// as kept in adhan-js's test data) are whole minutes, so each calculated time
// may differ from them by up to a minute. The tests run on Makkah time (see
// jest.global-setup.js).
const MAKKAH: PrayerSettings = {
  latitude: 21.427009,
  longitude: 39.828685,
  method: 'UmmAlQura',
  delayMinutes: 15,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
};
const at = (hours: number, minutes: number, date = 5) => new Date(2016, 2, date, hours, minutes);
const PUBLISHED = {
  fajr: at(5, 22),
  dhuhr: at(12, 33),
  asr: at(15, 55),
  maghrib: at(18, 27),
  isha: at(19, 57),
};
const MARCH_5 = { from: at(0, 0), to: at(23, 59) };
const MINUTE = 60 * 1000;

// A new Question is due from the moment it is added.
const NEW_QUESTION: StudyQuestion = { id: 'q', subjectId: 'fiqh', lessonNumber: 1, priority: 'core', createdAt: 0, state: null };
const SOMETHING_DUE = [NEW_QUESTION];

const prayers = (reminders: Reminder[]) => reminders.map((r) => r.prayer);

describe('reminderTimes', () => {
  test.each([0, 15, 40])('matches the published prayer times plus a delay of %i minutes', (delayMinutes) => {
    const reminders = reminderTimes({ ...MAKKAH, delayMinutes }, MARCH_5, SOMETHING_DUE);
    expect(prayers(reminders)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    for (const { prayer, at: fireAt } of reminders) {
      const expected = PUBLISHED[prayer].getTime() + delayMinutes * MINUTE;
      expect(Math.abs(fireAt.getTime() - expected)).toBeLessThanOrEqual(MINUTE);
    }
  });

  test('skips prayers that are turned off', () => {
    const settings = { ...MAKKAH, prayers: { ...MAKKAH.prayers, fajr: false, asr: false } };
    expect(prayers(reminderTimes(settings, MARCH_5, SOMETHING_DUE))).toEqual(['dhuhr', 'maghrib', 'isha']);
  });

  test('gives no Reminder when there are no Questions', () => {
    expect(reminderTimes(MAKKAH, MARCH_5, [])).toEqual([]);
  });

  test('gives no Reminder when nothing will be due at its time', () => {
    const later = rate(null, 'easy', at(8, 0));
    const notDueToday = { ...NEW_QUESTION, state: { ...later, due: at(8, 0, 9).getTime() } };
    expect(reminderTimes(MAKKAH, MARCH_5, [notDueToday])).toEqual([]);
  });

  test('starts with the first prayer at which a Question becomes due', () => {
    const reviewed = rate(null, 'good', at(8, 0));
    const dueAfterAsr = { ...NEW_QUESTION, state: { ...reviewed, due: at(16, 30).getTime() } };
    expect(prayers(reminderTimes(MAKKAH, MARCH_5, [dueAfterAsr]))).toEqual(['maghrib', 'isha']);
  });

  test('covers several days, leaving out Reminders before the range starts', () => {
    const range = { from: at(13, 0), to: at(13, 0, 7) };
    const reminders = reminderTimes(MAKKAH, range, SOMETHING_DUE);
    expect(prayers(reminders)).toEqual([
      ...['asr', 'maghrib', 'isha'],
      ...['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
      ...['fajr', 'dhuhr'],
    ]);
    expect(reminders.map((r) => r.at.getDate())).toEqual([5, 5, 5, 6, 6, 6, 6, 6, 7, 7]);
  });

  test.each([
    ['Oslo in midsummer, when twilight lasts all night', 59.9139, 10.7522],
    ['Tromsø under the midnight sun', 69.6492, 18.9553],
  ])('gives all five prayers in %s', (_place, latitude, longitude) => {
    const settings = { ...MAKKAH, latitude, longitude, method: 'MuslimWorldLeague' as const };
    const midsummer = { from: new Date(2026, 5, 21, 0, 0), to: new Date(2026, 5, 21, 23, 59) };
    const reminders = reminderTimes(settings, midsummer, SOMETHING_DUE);
    // The clock is on Makkah time, so the day's prayers don't start at Fajr.
    expect(prayers(reminders).sort()).toEqual(['asr', 'dhuhr', 'fajr', 'isha', 'maghrib']);
  });

  // Agadir (Tikiouine), 21 October 2026, as فجر shows them with its Morocco
  // method on a phone whose clock was on UTC. Its Asr is 2 minutes later than
  // adhan's, from an adjustment of its own; that one is only checked roughly.
  test('matches the Moroccan times for Agadir', () => {
    const settings = { ...MAKKAH, latitude: 30.3815, longitude: -9.5036, method: 'Morocco' as const, delayMinutes: 0 };
    const utc = (hours: number, minutes: number) => new Date(Date.UTC(2026, 9, 21, hours, minutes));
    const expected = { fajr: utc(5, 19), dhuhr: utc(12, 28), asr: utc(15, 36), maghrib: utc(18, 6), isha: utc(19, 16) };
    const day = { from: utc(0, 0), to: utc(23, 0) };
    const reminders = reminderTimes(settings, day, SOMETHING_DUE);
    expect(prayers(reminders)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    for (const { prayer, at: fireAt } of reminders) {
      const tolerance = prayer === 'asr' ? 3 * MINUTE : MINUTE;
      expect(Math.abs(fireAt.getTime() - expected[prayer].getTime())).toBeLessThanOrEqual(tolerance);
    }
  });

  test("keeps the previous day's Isha when the delay carries it past midnight", () => {
    const settings = { ...MAKKAH, delayMinutes: 250 };
    const reminders = reminderTimes(settings, { from: at(0, 0, 6), to: at(3, 0, 6) }, SOMETHING_DUE);
    expect(prayers(reminders)).toEqual(['isha']);
    expect(reminders[0].at.getDate()).toBe(6);
  });
});
