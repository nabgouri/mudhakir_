import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'mudhakir.db';

// Rows are never removed: `deleted_at` marks a deletion so sync can send it
// to the cloud. `updated_at` lets the last write win on sync; a change sets
// it to now, or one past its old value if the phone's clock is behind the
// version it pulled, so the change still counts as the last write.
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
  // Cloud sync (src/sync/). `synced_updated_at` is the `updated_at` last
  // sent to or received from the cloud, so a row needs pushing while the two
  // differ. A Review needs pushing until `synced`, the one column of a
  // Review that may change. `sync_state` holds how far each table has been
  // pulled.
  //
  // Subject names and Lesson numbers may now repeat: sync can bring in a
  // Subject or Lesson made on another phone, and both are kept rather than
  // one lost. The app still checks its own writes for repeats.
  //
  // Settings the student never saved get time 0, so on a fresh install the
  // backed-up settings win over the defaults.
  `
  DROP INDEX subjects_live_name;
  DROP INDEX lessons_live_number;
  CREATE INDEX lessons_subject ON lessons (subject_id);

  ALTER TABLE subjects ADD COLUMN synced_updated_at INTEGER;
  ALTER TABLE lessons ADD COLUMN synced_updated_at INTEGER;
  ALTER TABLE questions ADD COLUMN synced_updated_at INTEGER;
  ALTER TABLE settings ADD COLUMN synced_updated_at INTEGER;
  ALTER TABLE reviews ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;

  DROP TRIGGER reviews_no_update;
  CREATE TRIGGER reviews_no_update BEFORE UPDATE OF id, question_id, rating, reviewed_at ON reviews
  BEGIN SELECT RAISE(ABORT, 'reviews are append-only'); END;

  UPDATE settings SET updated_at = 0 WHERE latitude IS NULL;

  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // Question generation, as in the cloud's `lessons` and `questions`
  // (supabase/migrations/). `generation_status` is null for a Lesson with
  // nothing to generate from, and `waiting` until the phone has sent it.
  // `parts_done` and `failed_parts` are JSON arrays of part indexes. A
  // generated Question's `part_index` is the routine run that wrote it.
  `
  ALTER TABLE lessons ADD COLUMN interactive_review_url TEXT;
  ALTER TABLE lessons ADD COLUMN generation_status TEXT
    CHECK (generation_status IN ('waiting', 'generating', 'ready', 'failed'));
  ALTER TABLE lessons ADD COLUMN part_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lessons ADD COLUMN parts_done TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE lessons ADD COLUMN failed_parts TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE lessons ADD COLUMN error TEXT;
  ALTER TABLE questions ADD COLUMN part_index INTEGER;
  `,
  // Transcripts (src/data/lessons.ts). `lesson_parts` holds each part of a
  // Lesson still to be sent for generation, with its share of the
  // Transcript's text; a part's row is deleted once the cloud has it, so the
  // text stays on the phone only until it is sent. It is never synced.
  // `transcript_digests` (synced) is a JSON array of each part's SHA-256, in
  // hex: empty for a Lesson without a Transcript. A retry checks a
  // re-attached Transcript against it, and the routine checks its copy of a
  // part's text. Lessons already waiting get their one part queued.
  `
  CREATE TABLE lesson_parts (
    lesson_id TEXT NOT NULL REFERENCES lessons (id),
    part_index INTEGER NOT NULL,
    transcript_text TEXT,
    PRIMARY KEY (lesson_id, part_index)
  );
  ALTER TABLE lessons ADD COLUMN transcript_digests TEXT NOT NULL DEFAULT '[]';
  INSERT INTO lesson_parts (lesson_id, part_index)
    SELECT id, 0 FROM lessons
    WHERE generation_status = 'waiting' AND interactive_review_url IS NOT NULL AND deleted_at IS NULL;
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // Sync writes in its own transactions, so a write that meets one waits
  // for it instead of failing.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  for (let next = version; next < MIGRATIONS.length; next++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRATIONS[next]);
      await tx.execAsync(`PRAGMA user_version = ${next + 1}`);
    });
  }
}

// A transaction on its own connection, so other queries can't slip into it.
// It waits for another writer (sync, or the background task) rather than
// failing. BEGIN only takes the write lock at the first write, so a write
// that changes nothing takes it at once, before any read could go stale.
export async function writeTransaction(
  db: SQLiteDatabase,
  task: (tx: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('PRAGMA busy_timeout = 5000');
    await tx.execAsync('UPDATE settings SET id = id WHERE 0');
    await task(tx);
  });
}

export type SaveResult = { ok: true } | { ok: false; reason: 'duplicate' };

// Runs a write unless `taken` finds the Subject name or Lesson number
// already in use, checking and writing in one transaction.
export async function saveIfUnique(
  db: SQLiteDatabase,
  taken: (tx: SQLiteDatabase) => Promise<boolean>,
  write: (tx: SQLiteDatabase) => Promise<unknown>,
): Promise<SaveResult> {
  let result: SaveResult = { ok: true };
  await writeTransaction(db, async (tx) => {
    if (await taken(tx)) result = { ok: false, reason: 'duplicate' };
    else await write(tx);
  });
  return result;
}
