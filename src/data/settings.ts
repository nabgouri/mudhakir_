import type { SQLiteDatabase } from 'expo-sqlite';

import {
  CALCULATION_METHODS,
  PRAYERS,
  type CalculationMethodName,
  type Prayer,
  type PrayerSettings,
} from '@/engine/reminders';

// Where the student prays: a bundled city, or coordinates typed by hand
// (`cityId` null).
export type Place = { cityId: string | null; latitude: number; longitude: number };

export type Settings = {
  place: Place | null;
  method: CalculationMethodName;
  delayMinutes: number;
  prayers: Record<Prayer, boolean>;
};

type SettingsRow = {
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
  method: string;
  delayMinutes: number;
  prayers: string;
};

function parsePrayers(json: string): Record<Prayer, boolean> {
  const stored = JSON.parse(json) as Partial<Record<Prayer, boolean>>;
  return Object.fromEntries(PRAYERS.map((prayer) => [prayer, stored[prayer] !== false])) as Record<Prayer, boolean>;
}

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const row = await db.getFirstAsync<SettingsRow>(
    `SELECT city_id AS cityId, latitude, longitude, method, delay_minutes AS delayMinutes, prayers
     FROM settings WHERE id = 1`,
  );
  if (!row) throw new Error('The settings row is missing');
  const method = (CALCULATION_METHODS as readonly string[]).includes(row.method)
    ? (row.method as CalculationMethodName)
    : 'MuslimWorldLeague';
  return {
    place:
      row.latitude === null || row.longitude === null
        ? null
        : { cityId: row.cityId, latitude: row.latitude, longitude: row.longitude },
    method,
    delayMinutes: row.delayMinutes,
    prayers: parsePrayers(row.prayers),
  };
}

export async function saveSettings(db: SQLiteDatabase, settings: Settings): Promise<void> {
  await db.runAsync(
    `UPDATE settings SET city_id = ?, latitude = ?, longitude = ?, method = ?, delay_minutes = ?, prayers = ?,
       updated_at = ?
     WHERE id = 1`,
    settings.place?.cityId ?? null,
    settings.place?.latitude ?? null,
    settings.place?.longitude ?? null,
    settings.method,
    settings.delayMinutes,
    JSON.stringify(settings.prayers),
    Date.now(),
  );
}

// What the study engine needs to time Reminders; null until a place is chosen.
export function prayerSettings(settings: Settings): PrayerSettings | null {
  if (settings.place === null) return null;
  return {
    latitude: settings.place.latitude,
    longitude: settings.place.longitude,
    method: settings.method,
    delayMinutes: settings.delayMinutes,
    prayers: settings.prayers,
  };
}
