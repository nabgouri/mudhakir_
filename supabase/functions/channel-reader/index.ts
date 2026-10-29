// The Channel Reader
// (docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md):
// imports each new Lesson from the Ma'had Channel and sends it for
// generation, as the phone does for a Lesson added by hand.
//
// Called every hour by pg_cron (`run_channel_reader`) with the shared secret
// that only the database holds. Each call:
//
//  1. signs in as the student's Telegram account and reads the channel's
//     posts since the last call (all of them the first time);
//  2. reads them as Lessons (shared/channel.ts) and imports the oldest one
//     not yet in Supabase: its Subject (if new) and the Lesson, with its
//     Lesson Title and Interactive Review, its Transcript read from the PDF
//     (shared/pdf-text.ts) and split as the phone splits it;
//  3. sends its parts for generation, and any part of an earlier import the
//     routine's hourly limit kept back.
//
// An imported Lesson is not studied: its Questions are not introduced until
// the student marks it studied in the app.
//
// One Lesson per call keeps each call within Supabase's limits; while more
// are waiting, the call queues the next one through pg_net before it returns.
//
// Past Lessons are imported only for the books in `channel_reader_state`'s
// `past_subjects`; every Lesson posted since `import_since` is.
//
// A post less than 10 minutes old is left for the next call, since a
// Lesson's posts arrive over a few minutes. A Lesson whose Subject and
// number are already in Supabase, even deleted, is never imported again.
//
// Secrets (Edge Function secrets):
//   TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_CHANNEL_ID
//     from scripts/telegram-login.mts
//   STUDENT_USER_ID, ROUTINE_ID, ROUTINE_TOKEN  as for `generate-lesson`
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// mtcute's web build, not its Deno one: the Deno build imports `node:sqlite`,
// which Edge Functions don't have, even when its SQLite storage is unused.
import { MemoryStorage, TelegramClient, WebPlatform, type Chat, type Message } from '@mtcute/web';

// Loading pdf.js's worker build first sets `globalThis.pdfjsWorker`, so
// pdf.js parses here without a worker, as on the phone. The files are the
// phone's pdfjs-dist ones, loaded by URL (deno.json): through `npm:`, the
// bundler also pulls its optional native canvas package and the deploy fails.
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';

import { lessonsFromPosts, lessonsToImport, type ChannelLesson, type ChannelPost } from '../../../shared/channel.ts';
import { GenerateRequest } from '../../../shared/generation.ts';
import { documentText, pageText } from '../../../shared/pdf-text.ts';
import { lessonTranscriptParts } from '../../../shared/transcript.ts';
import { sendPart } from '../_shared/send-part.ts';

// Posts of one Lesson arrive over a few minutes; younger posts wait.
const SETTLE_MS = 10 * 60 * 1000;

// The web platform reads `navigator.onLine`, which Deno doesn't have, and
// would then start out believing it is offline.
class EdgePlatform extends WebPlatform {
  override isOnline(): boolean {
    return true;
  }
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The ${name} secret is not set`);
  return value;
}

function toPost(message: Message): ChannelPost {
  const media = message.media;
  return {
    id: message.id,
    date: message.date.getTime(),
    text: message.text,
    mediaType: media?.type ?? null,
    document: media?.type === 'document' ? { fileName: media.fileName ?? '', mimeType: media.mimeType } : null,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The Transcript's text, read as the phone reads it, with the same pdf.js.
async function pdfText(data: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    pages.push(pageText((await page.getTextContent()).items));
    page.cleanup();
  }
  await task.destroy();
  return documentText(pages);
}

class Reader {
  private constructor(
    private tg: TelegramClient,
    private channel: Chat,
    private db: SupabaseClient,
    private owner: string,
  ) {}

  static async open(db: SupabaseClient): Promise<Reader> {
    const tg = new TelegramClient({
      apiId: Number(env('TELEGRAM_API_ID')),
      apiHash: env('TELEGRAM_API_HASH'),
      storage: new MemoryStorage(),
      platform: new EdgePlatform(),
      disableUpdates: true,
    });
    await tg.importSession(env('TELEGRAM_SESSION'));
    await tg.connect();
    // A new in-memory session doesn't know the channel's access hash, so it
    // is found among the account's chats. Only this one chat is ever read.
    const channelId = Number(env('TELEGRAM_CHANNEL_ID'));
    for await (const dialog of tg.iterDialogs()) {
      if (dialog.peer.id === channelId && dialog.peer.type === 'chat') {
        return new Reader(tg, dialog.peer, db, env('STUDENT_USER_ID'));
      }
    }
    await tg.destroy();
    throw new Error(`The Telegram account has no chat with id ${channelId}`);
  }

  close(): Promise<void> {
    return this.tg.destroy();
  }

  // The channel's posts after `afterId`, oldest first, leaving out those
  // still settling.
  async postsAfter(afterId: number, now: number): Promise<ChannelPost[]> {
    const posts: ChannelPost[] = [];
    for await (const message of this.tg.iterHistory(this.channel)) {
      if (message.id <= afterId) break;
      if (now - message.date.getTime() >= SETTLE_MS) posts.push(toPost(message));
    }
    return posts.reverse();
  }

  async transcriptOf(pdfPostId: number): Promise<string> {
    const [message] = await this.tg.getMessages(this.channel, pdfPostId);
    if (message?.media?.type !== 'document') throw new Error(`Post ${pdfPostId} no longer has its PDF`);
    return pdfText(await this.tg.downloadAsBuffer(message.media));
  }

  // Whether the Subject already has a Lesson with this number, even deleted.
  async isImported(lesson: ChannelLesson): Promise<boolean> {
    const { data, error } = await this.db
      .from('lessons')
      .select('id, subjects!inner(name)')
      .eq('owner', this.owner)
      .eq('number', lesson.lessonNumber)
      .eq('subjects.name', lesson.subjectName)
      .limit(1);
    if (error) throw new Error(`Looking the Lesson up failed: ${error.message}`);
    return data.length > 0;
  }

  private async subjectId(name: string, now: string): Promise<string> {
    const { data, error } = await this.db
      .from('subjects')
      .select('id')
      .eq('owner', this.owner)
      .eq('name', name)
      .is('deleted_at', null)
      .limit(1);
    if (error) throw new Error(`Looking the Subject up failed: ${error.message}`);
    if (data.length > 0) return data[0].id;
    const id = crypto.randomUUID();
    const { error: insertError } = await this.db
      .from('subjects')
      .insert({ id, owner: this.owner, name, created_at: now, updated_at: now });
    if (insertError) throw new Error(`Adding the Subject failed: ${insertError.message}`);
    return id;
  }

  // Adds the Lesson as the phone would (src/data/lessons.ts `addLesson`),
  // waiting to be sent.
  async importLesson(lesson: ChannelLesson): Promise<string> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const transcript = lesson.pdfPostId === null ? null : await this.transcriptOf(lesson.pdfPostId);
    const parts =
      transcript === null
        ? []
        : lessonTranscriptParts({ id, number: lesson.lessonNumber, interactiveReviewUrl: lesson.interactiveReviewUrl }, transcript);
    const partCount = Math.max(parts.length, lesson.interactiveReviewUrl === null ? 0 : 1);
    const { error } = await this.db.from('lessons').insert({
      id,
      owner: this.owner,
      subject_id: await this.subjectId(lesson.subjectName, now),
      number: lesson.lessonNumber,
      title: lesson.title,
      // Not studied until the student marks it studied in the app.
      studied_at: null,
      interactive_review_url: lesson.interactiveReviewUrl,
      transcript_digests: await Promise.all(parts.map(sha256Hex)),
      generation_status: partCount === 0 ? null : 'waiting',
      part_count: partCount,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(`Adding the Lesson failed: ${error.message}`);
    const { error: importError } = await this.db
      .from('channel_imports')
      .insert({ lesson_id: id, pdf_post_id: lesson.pdfPostId, post_ids: lesson.postIds });
    if (importError) throw new Error(`Recording the import failed: ${importError.message}`);
    return id;
  }

  // Sends every part of an imported Lesson not yet sent, done or failed.
  // Returns false when the routine's hourly limit stopped it.
  async sendUnsentParts(lessonId: string): Promise<boolean> {
    const { data: lesson, error } = await this.db
      .from('lessons')
      .select('number, interactive_review_url, part_count, parts_sent, parts_done, failed_parts, subjects(name), channel_imports(pdf_post_id)')
      .eq('id', lessonId)
      .single();
    if (error) throw new Error(`Reading the Lesson failed: ${error.message}`);
    const handled = new Set<number>([...lesson.parts_sent, ...lesson.parts_done, ...lesson.failed_parts]);
    const unsent = Array.from({ length: lesson.part_count }, (_, i) => i).filter((i) => !handled.has(i));
    if (unsent.length === 0) return true;

    // One import per Lesson; PostgREST may give it as an object or a list.
    const imports = [lesson.channel_imports].flat() as ({ pdf_post_id: number | null } | null)[];
    const pdfPostId = imports[0]?.pdf_post_id ?? null;
    const transcript = pdfPostId === null ? null : await this.transcriptOf(pdfPostId);
    const reviewUrl = lesson.interactive_review_url as string | null;
    const texts =
      transcript === null ? [] : lessonTranscriptParts({ id: lessonId, number: lesson.number, interactiveReviewUrl: reviewUrl }, transcript);
    for (const partIndex of unsent) {
      const request = GenerateRequest.parse({
        lessonId,
        subjectName: (lesson.subjects as unknown as { name: string }).name,
        lessonNumber: lesson.number,
        interactiveReviewUrl: partIndex === 0 ? (reviewUrl ?? undefined) : undefined,
        transcriptText: texts[partIndex],
        partIndex,
        partCount: lesson.part_count,
      });
      const result = await sendPart(this.db, request, async (text) => {
        const { error: keepError } = await this.db
          .from('lesson_part_texts')
          .upsert({ lesson_id: lessonId, part_index: partIndex, text, created_at: new Date().toISOString() });
        return keepError?.message ?? null;
      });
      if (result.status === 'failed') {
        if (result.httpStatus === 429) return false;
        throw new Error(`Sending part ${partIndex} of Lesson ${lesson.number} failed: ${result.error}`);
      }
    }
    return true;
  }

  // Imported Lessons with a part still to send, oldest first. A Lesson the
  // limit stopped part-way is `generating`, with some parts sent.
  async lessonsWithUnsentParts(): Promise<string[]> {
    const { data, error } = await this.db
      .from('lessons')
      .select('id, part_count, parts_sent, parts_done, failed_parts, channel_imports!inner(lesson_id)')
      .eq('owner', this.owner)
      .is('deleted_at', null)
      .in('generation_status', ['waiting', 'generating'])
      .order('created_at');
    if (error) throw new Error(`Looking for Lessons to send failed: ${error.message}`);
    return data
      .filter((row) => {
        const handled = new Set<number>([...row.parts_sent, ...row.parts_done, ...row.failed_parts]);
        return Array.from({ length: row.part_count }, (_, i) => i).some((i) => !handled.has(i));
      })
      .map((row) => row.id);
  }
}

type State = { last_post_id: number; import_since: string; past_subjects: string[] };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = req.headers.get('x-reader-secret') ?? '';
  const { data: allowed } = await db.rpc('channel_reader_secret_ok', { p_secret: secret });
  if (allowed !== true) return reply(401, { error: 'Wrong secret' });

  // How long each step took, in the logs, since a call must end within
  // Supabase's 150 seconds.
  const started = Date.now();
  const step = (name: string) => console.log(`channel-reader: ${name} after ${Date.now() - started} ms`);

  let reader: Reader | null = null;
  try {
    const { data: state, error: stateError } = await db
      .from('channel_reader_state')
      .select('last_post_id, import_since, past_subjects')
      .single<State>();
    if (stateError) throw new Error(`Reading the reader's state failed: ${stateError.message}`);
    reader = await Reader.open(db);
    step('connected to Telegram');

    const posts = await reader.postsAfter(state.last_post_id, Date.now());
    step(`read ${posts.length} posts`);
    const parsed = lessonsFromPosts(posts);
    const problems = parsed.problems;
    const lessons = lessonsToImport(parsed.lessons, {
      since: new Date(state.import_since).getTime(),
      pastSubjects: state.past_subjects,
    });

    // The routine's hourly limit may have kept parts back: those first.
    let limited = false;
    for (const lessonId of await reader.lessonsWithUnsentParts()) {
      if (!(await reader.sendUnsentParts(lessonId))) {
        limited = true;
        break;
      }
    }

    const waiting: ChannelLesson[] = [];
    for (const lesson of lessons) if (!(await reader.isImported(lesson))) waiting.push(lesson);

    let imported: { subject: string; number: number } | null = null;
    if (!limited && waiting.length > 0) {
      const [next] = waiting;
      const lessonId = await reader.importLesson(next);
      step(`imported ${next.subjectName} ${next.lessonNumber}`);
      limited = !(await reader.sendUnsentParts(lessonId));
      step('sent it for generation');
      imported = { subject: next.subjectName, number: next.lessonNumber };
    }
    const more = waiting.length - (imported ? 1 : 0);

    // Past these posts once every Lesson in them is imported; until then
    // the next call reads them again, and skips what it already imported.
    const lastPostId = more === 0 && posts.length > 0 ? posts[posts.length - 1].id : state.last_post_id;
    await db
      .from('channel_reader_state')
      .update({ last_post_id: lastPostId, last_run_at: new Date().toISOString(), last_error: null, problems })
      .eq('id', 1);

    // The next Lesson in a call of its own, queued through pg_net like the
    // hourly job (a request this function started itself would be dropped
    // when it shuts down), unless the routine's limit is reached: the hourly
    // call carries on from there.
    if (more > 0 && !limited) {
      const { error: nextError } = await db.rpc('run_channel_reader');
      if (nextError) console.error('Queueing the next call failed', nextError.message);
    }
    return reply(200, { imported, waiting: more, limited, problems });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('The Channel Reader failed', message);
    await db.from('channel_reader_state').update({ last_run_at: new Date().toISOString(), last_error: message }).eq('id', 1);
    return reply(500, { error: message });
  } finally {
    await reader?.close();
  }
});
