import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'mudhakir.db';

// Rows are never removed: `deleted_at` marks a deletion so the sync ticket
// can send it to the cloud. `updated_at` lets the last write win on sync.
// Times are milliseconds since the epoch.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE subjects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX subjects_live_name ON subjects (name) WHERE deleted_at IS NULL;

  CREATE TABLE lessons (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT NOT NULL REFERENCES subjects (id),
    number INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX lessons_live_number ON lessons (subject_id, number) WHERE deleted_at IS NULL;
  `,
  // `options` is a JSON array of strings for a Multiple-Choice Question.
  // `origin` is null for a Question the student added by hand. `schedule` is
  // the study engine's state as JSON, null until the first Review; it is
  // updated in the same transaction that appends the Review.
  `
  CREATE TABLE questions (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL REFERENCES lessons (id),
    kind TEXT NOT NULL CHECK (kind IN ('multiple-choice', 'open')),
    origin TEXT CHECK (origin IN ('interactive-review', 'concept-card', 'transcript')),
    prompt TEXT NOT NULL,
    options TEXT,
    correct_option INTEGER,
    answer TEXT,
    source_passage TEXT,
    edited INTEGER NOT NULL DEFAULT 0,
    schedule TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX questions_lesson ON questions (lesson_id);

  CREATE TABLE reviews (
    id TEXT PRIMARY KEY NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions (id),
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    reviewed_at INTEGER NOT NULL
  );
  CREATE INDEX reviews_question ON reviews (question_id);

  -- Reviews are append-only: they are never changed or removed.
  CREATE TRIGGER reviews_no_update BEFORE UPDATE ON reviews
  BEGIN SELECT RAISE(ABORT, 'reviews are append-only'); END;
  CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
  BEGIN SELECT RAISE(ABORT, 'reviews are append-only'); END;
  `,
  // The student's settings: one row. `city_id` names a bundled city, or is
  // null when the coordinates were typed by hand; `latitude` and `longitude`
  // are null until a place is chosen, and no Reminder is scheduled until
  // then. `prayers` is a JSON object of the prayers turned on. The first row
  // holds the defaults: Muslim World League, 15 minutes after the adhan.
  `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    city_id TEXT,
    latitude REAL,
    longitude REAL,
    method TEXT NOT NULL,
    delay_minutes INTEGER NOT NULL,
    prayers TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  INSERT INTO settings (id, method, delay_minutes, prayers, updated_at) VALUES (
    1, 'MuslimWorldLeague', 15,
    '{"fajr":true,"dhuhr":true,"asr":true,"maghrib":true,"isha":true}',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  for (let next = version; next < MIGRATIONS.length; next++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRATIONS[next]);
      await tx.execAsync(`PRAGMA user_version = ${next + 1}`);
    });
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'duplicate' };

// Runs a write that a unique index may refuse (a Subject name or Lesson
// number already in use) and reports that refusal instead of throwing.
export async function saveUnique(write: () => Promise<unknown>): Promise<SaveResult> {
  try {
    await write();
    return { ok: true };
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return { ok: false, reason: 'duplicate' };
    throw error;
  }
}
