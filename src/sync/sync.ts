import type { SQLiteDatabase } from 'expo-sqlite';

import { writeTransaction } from '@/data/database';
import { replay, type Rating } from '@/engine/study';
import { rescheduleReminders } from '@/reminders/schedule';

import { client, supabase } from './client';
import { lessonsAwaitingQuestions, notifyQuestionsReady, sendQueuedParts } from './generation';

// Two-way sync between the phone's SQLite database and the student's
// Supabase tables (supabase/migrations/). Each sync pushes the phone's
// changes, then pulls the cloud's.
//
// - Subjects, Lessons, Questions and settings: the last write by
//   `updated_at` wins, on both sides. A deletion is a write that sets
//   `deleted_at`, so it syncs like any other.
// - Reviews are append-only, so they never conflict. A Question's schedule
//   is not synced: the phone rebuilds it from the Question's Reviews.
// - Between pushing and pulling, queued Lesson parts are sent for
//   generation (./generation.ts); the pull then brings their new status,
//   and later their Questions.

const PAGE = 500;

// A row written in the cloud just before a pull can become visible just
// after it, so each sync pulls again from a little before where the last
// one stopped. Pulling a row twice changes nothing.
const PULL_OVERLAP_MS = 2 * 60 * 1000;

// How a column is stored on each side: as is, as milliseconds here and a
// timestamp there, as JSON text here and JSON there, or 0/1 here and a
// boolean there.
type Kind = 'value' | 'time' | 'json' | 'boolean';

type Table = {
  name: 'subjects' | 'lessons' | 'questions';
  columns: Record<string, Kind>;
  // The column naming the row's parent, and the parent's table.
  parent?: { column: string; table: string };
};

const TABLES: Table[] = [
  {
    name: 'subjects',
    columns: { id: 'value', name: 'value', created_at: 'time', updated_at: 'time', deleted_at: 'time' },
  },
  {
    name: 'lessons',
    columns: {
      id: 'value',
      subject_id: 'value',
      number: 'value',
      title: 'value',
      studied_at: 'time',
      interactive_review_url: 'value',
      transcript_digests: 'json',
      generation_status: 'value',
      part_count: 'value',
      parts_done: 'json',
      failed_parts: 'json',
      error: 'value',
      created_at: 'time',
      updated_at: 'time',
      deleted_at: 'time',
    },
    parent: { column: 'subject_id', table: 'subjects' },
  },
  {
    name: 'questions',
    columns: {
      id: 'value',
      lesson_id: 'value',
      part_index: 'value',
      kind: 'value',
      origin: 'value',
      priority: 'value',
      prompt: 'value',
      options: 'json',
      correct_option: 'value',
      answer: 'value',
      source_passage: 'value',
      edited: 'boolean',
      created_at: 'time',
      updated_at: 'time',
      deleted_at: 'time',
    },
    parent: { column: 'lesson_id', table: 'lessons' },
  },
];

type Row = Record<string, unknown>;

function toRemote(kind: Kind, value: unknown): unknown {
  if (value === null) return null;
  if (kind === 'time') return new Date(value as number).toISOString();
  if (kind === 'json') return JSON.parse(value as string);
  if (kind === 'boolean') return value === 1;
  return value;
}

// Postgres writes up to six decimals of a second, more than every Date.parse
// accepts, so they are cut to three.
function parseTime(text: string): number {
  const time = Date.parse(text.replace(/\.(\d+)/, (_, decimals: string) => `.${decimals.padEnd(3, '0').slice(0, 3)}`));
  if (Number.isNaN(time)) throw new Error(`Unreadable time from the cloud: ${text}`);
  return time;
}

function toLocal(kind: Kind, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (kind === 'time') return parseTime(value as string);
  if (kind === 'json') return JSON.stringify(value);
  if (kind === 'boolean') return value ? 1 : 0;
  return value;
}

function convert(columns: Record<string, Kind>, row: Row, to: typeof toRemote): Row {
  return Object.fromEntries(Object.entries(columns).map(([column, kind]) => [column, to(kind, row[column])]));
}

// --- Pushing ---

async function pushTable(db: SQLiteDatabase, owner: string, table: Table): Promise<void> {
  const columns = Object.keys(table.columns);
  for (;;) {
    const rows = await db.getAllAsync<Row>(
      `SELECT ${columns.join(', ')} FROM ${table.name}
       WHERE synced_updated_at IS NOT updated_at ORDER BY updated_at LIMIT ${PAGE}`,
    );
    if (rows.length === 0) return;
    const { error } = await client()
      .from(table.name)
      .upsert(rows.map((row) => ({ ...convert(table.columns, row, toRemote), owner })));
    if (error) throw error;
    // A row changed again since it was read still needs pushing.
    await writeTransaction(db, async (tx) => {
      for (const row of rows) {
        await tx.runAsync(
          `UPDATE ${table.name} SET synced_updated_at = updated_at WHERE id = ? AND updated_at = ?`,
          row.id as string,
          row.updated_at as number,
        );
      }
    });
  }
}

async function pushReviews(db: SQLiteDatabase, owner: string): Promise<void> {
  for (;;) {
    const rows = await db.getAllAsync<{ id: string; question_id: string; rating: Rating; reviewed_at: number }>(
      `SELECT id, question_id, rating, reviewed_at FROM reviews WHERE synced = 0 ORDER BY reviewed_at LIMIT ${PAGE}`,
    );
    if (rows.length === 0) return;
    const { error } = await client()
      .from('reviews')
      .upsert(
        rows.map((row) => ({ ...row, reviewed_at: new Date(row.reviewed_at).toISOString(), owner })),
        { ignoreDuplicates: true },
      );
    if (error) throw error;
    await writeTransaction(db, async (tx) => {
      for (const row of rows) await tx.runAsync('UPDATE reviews SET synced = 1 WHERE id = ?', row.id);
    });
  }
}

const SETTINGS_COLUMNS: Record<string, Kind> = {
  city_id: 'value',
  latitude: 'value',
  longitude: 'value',
  method: 'value',
  delay_minutes: 'value',
  prayers: 'json',
  updated_at: 'time',
};

async function pushSettings(db: SQLiteDatabase, owner: string): Promise<void> {
  const row = await db.getFirstAsync<Row>(
    `SELECT ${Object.keys(SETTINGS_COLUMNS).join(', ')} FROM settings
     WHERE id = 1 AND synced_updated_at IS NOT updated_at`,
  );
  if (row === null) return;
  const { error } = await client()
    .from('settings')
    .upsert({ ...convert(SETTINGS_COLUMNS, row, toRemote), owner }, { onConflict: 'owner' });
  if (error) throw error;
  await db.runAsync(
    'UPDATE settings SET synced_updated_at = updated_at WHERE id = 1 AND updated_at = ?',
    row.updated_at as number,
  );
}

// --- Pulling ---

// How far a table has been pulled: the last row's cloud write time (as the
// cloud wrote it, to the microsecond) and id.
type Cursor = { at: string; id: string };

async function readCursor(db: SQLiteDatabase, table: string): Promise<Cursor | null> {
  const value = await readState(db, `pulled:${table}`);
  return value === null ? null : (JSON.parse(value) as Cursor);
}

async function readState(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', key);
  return row?.value ?? null;
}

async function writeState(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// Reads one table's cloud changes page by page, in write order, and hands
// each page to `apply`. `apply` returns how many of the rows it took; when
// it stops short (a row whose parent hasn't arrived yet) the pull stops
// there and the next sync carries on from that row.
async function pullPages(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  apply: (tx: SQLiteDatabase, rows: Row[]) => Promise<number>,
): Promise<void> {
  const saved = await readCursor(db, table);
  // From a little before the saved cursor; the first page takes any id.
  let after: { at: string; id: string | null } | null =
    saved === null ? null : { at: new Date(parseTime(saved.at) - PULL_OVERLAP_MS).toISOString(), id: null };
  for (;;) {
    let query = client()
      .from(table)
      .select([...columns, 'server_updated_at'].join(', '));
    if (after !== null) {
      query =
        after.id === null
          ? query.gt('server_updated_at', after.at)
          : query.or(`server_updated_at.gt."${after.at}",and(server_updated_at.eq."${after.at}",id.gt.${after.id})`);
    }
    const { data, error } = await query.order('server_updated_at').order('id').limit(PAGE);
    if (error) throw error;
    const rows = data as unknown as Row[];
    if (rows.length === 0) return;

    let taken = 0;
    await writeTransaction(db, async (tx) => {
      taken = await apply(tx, rows);
      const last = rows[taken - 1];
      if (last) await writeState(tx, `pulled:${table}`, JSON.stringify({ at: last.server_updated_at, id: last.id }));
    });
    if (taken < rows.length || rows.length < PAGE) return;
    const last = rows[rows.length - 1];
    after = { at: last.server_updated_at as string, id: last.id as string };
  }
}

async function hasParent(tx: SQLiteDatabase, parent: Table['parent'], row: Row): Promise<boolean> {
  if (parent === undefined) return true;
  return (await tx.getFirstAsync(`SELECT 1 FROM ${parent.table} WHERE id = ?`, row[parent.column] as string)) !== null;
}

// A cloud row replaces the phone's when it is newer, or when they are the
// same write and the phone hasn't marked it synced. The phone's newer
// version is left to be pushed.
async function pullTable(db: SQLiteDatabase, table: Table): Promise<boolean> {
  const columns = Object.keys(table.columns);
  const updates = columns.filter((column) => column !== 'id').map((column) => `${column} = excluded.${column}`);
  const sql = `
    INSERT INTO ${table.name} (${columns.join(', ')}, synced_updated_at)
    VALUES (${columns.map(() => '?').join(', ')}, ?)
    ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}, synced_updated_at = excluded.updated_at
    WHERE excluded.updated_at > ${table.name}.updated_at
      OR (excluded.updated_at = ${table.name}.updated_at AND ${table.name}.synced_updated_at IS NOT ${table.name}.updated_at)`;
  let changed = false;
  await pullPages(db, table.name, columns, async (tx, rows) => {
    for (let i = 0; i < rows.length; i++) {
      if (!(await hasParent(tx, table.parent, rows[i]))) return i;
      const local = convert(table.columns, rows[i], toLocal);
      const values = columns.map((column) => local[column]) as (string | number | null)[];
      const result = await tx.runAsync(sql, ...values, local.updated_at as number);
      if (result.changes > 0) changed = true;
    }
    return rows.length;
  });
  return changed;
}

// New Reviews are added, then each of their Questions' schedules is rebuilt
// from all its Reviews.
async function pullReviews(db: SQLiteDatabase): Promise<boolean> {
  const reviewed = new Set<string>();
  const parent = { column: 'question_id', table: 'questions' };
  await pullPages(db, 'reviews', ['id', 'question_id', 'rating', 'reviewed_at'], async (tx, rows) => {
    for (let i = 0; i < rows.length; i++) {
      if (!(await hasParent(tx, parent, rows[i]))) return i;
      const row = rows[i] as { id: string; question_id: string; rating: Rating; reviewed_at: string };
      const result = await tx.runAsync(
        `INSERT INTO reviews (id, question_id, rating, reviewed_at, synced) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (id) DO NOTHING`,
        row.id,
        row.question_id,
        row.rating,
        parseTime(row.reviewed_at),
      );
      if (result.changes > 0) reviewed.add(row.question_id);
    }
    return rows.length;
  });

  for (const questionId of reviewed) {
    await writeTransaction(db, async (tx) => {
      const reviews = await tx.getAllAsync<{ rating: Rating; reviewedAt: number }>(
        'SELECT rating, reviewed_at AS reviewedAt FROM reviews WHERE question_id = ?',
        questionId,
      );
      await tx.runAsync('UPDATE questions SET schedule = ? WHERE id = ?', JSON.stringify(replay(reviews)), questionId);
    });
  }
  return reviewed.size > 0;
}

async function pullSettings(db: SQLiteDatabase): Promise<boolean> {
  const { data, error } = await client()
    .from('settings')
    .select(Object.keys(SETTINGS_COLUMNS).join(', '))
    .maybeSingle();
  if (error) throw error;
  if (data === null) return false;
  const row = convert(SETTINGS_COLUMNS, data as unknown as Row, toLocal);
  const result = await db.runAsync(
    `UPDATE settings SET city_id = ?, latitude = ?, longitude = ?, method = ?, delay_minutes = ?, prayers = ?,
       updated_at = ?, synced_updated_at = ?
     WHERE id = 1 AND (updated_at < ? OR (updated_at = ? AND synced_updated_at IS NOT updated_at))`,
    row.city_id as string | null,
    row.latitude as number | null,
    row.longitude as number | null,
    row.method as string,
    row.delay_minutes as number,
    row.prayers as string,
    row.updated_at as number,
    row.updated_at as number,
    row.updated_at as number,
    row.updated_at as number,
  );
  return result.changes > 0;
}

// --- Running a sync ---

export type SyncResult =
  | { status: 'not-configured' | 'signed-out' | 'failed' }
  | { status: 'synced'; changed: boolean };

// What the phone has sent and pulled belongs to one account. Signed in as
// another (or the same Google account given a new Supabase user), the phone
// sends everything again and pulls that account's backup from the start.
async function startAccount(db: SQLiteDatabase, owner: string): Promise<void> {
  if ((await readState(db, 'owner')) === owner) return;
  await writeTransaction(db, async (tx) => {
    for (const table of [...TABLES.map((t) => t.name), 'settings']) {
      await tx.runAsync(`UPDATE ${table} SET synced_updated_at = NULL`);
    }
    await tx.runAsync('UPDATE reviews SET synced = 0');
    await tx.runAsync('DELETE FROM sync_state');
    await writeState(tx, 'owner', owner);
  });
}

async function sync(db: SQLiteDatabase): Promise<SyncResult> {
  if (supabase === null) return { status: 'not-configured' };
  const { data } = await supabase.auth.getSession();
  const owner = data.session?.user.id;
  if (owner === undefined) return { status: 'signed-out' };
  await startAccount(db, owner);

  // Parents before children, so the cloud's foreign keys always hold.
  for (const table of TABLES) await pushTable(db, owner, table);
  await pushReviews(db, owner);
  await pushSettings(db, owner);
  await sendQueuedParts(db);

  const awaiting = await lessonsAwaitingQuestions(db);
  let changed = false;
  for (const table of TABLES) changed = (await pullTable(db, table)) || changed;
  changed = (await pullReviews(db)) || changed;
  changed = (await pullSettings(db)) || changed;

  await notifyQuestionsReady(db, awaiting);
  await writeState(db, 'last_synced_at', String(Date.now()));
  // New or changed Questions, Reviews or settings change when Reminders fire.
  if (changed) await rescheduleReminders(db);
  return { status: 'synced', changed };
}

let current: Promise<SyncResult> | null = null;
let next: Promise<SyncResult> | null = null;

// Syncs now, or right after the sync already running; calls made meanwhile
// share that one next sync. Failures (offline, signed out on the server)
// are logged, not thrown: the next trigger tries again.
export function syncNow(db: SQLiteDatabase): Promise<SyncResult> {
  if (current === null) {
    current = sync(db)
      .catch((error): SyncResult => {
        console.warn('Sync failed', error);
        return { status: 'failed' };
      })
      .finally(() => {
        current = null;
      });
    return current;
  }
  next ??= current.then(() => {
    next = null;
    return syncNow(db);
  });
  return next;
}

// Whether the phone has changes the cloud doesn't have yet.
export async function hasPendingChanges(db: SQLiteDatabase): Promise<boolean> {
  const changed = [...TABLES.map((table) => table.name), 'settings'].map(
    (table) => `EXISTS (SELECT 1 FROM ${table} WHERE synced_updated_at IS NOT updated_at)`,
  );
  const row = await db.getFirstAsync<{ pending: number }>(
    `SELECT ${[...changed, 'EXISTS (SELECT 1 FROM reviews WHERE synced = 0)'].join(' OR ')} AS pending`,
  );
  return row?.pending === 1;
}

// When the phone last finished a sync, or null if it never has.
export async function lastSyncedAt(db: SQLiteDatabase): Promise<Date | null> {
  const value = await readState(db, 'last_synced_at');
  return value === null ? null : new Date(Number(value));
}
