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
