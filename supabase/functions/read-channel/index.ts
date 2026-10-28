// A spike for the Channel Reader
// (docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md):
// can an Edge Function sign in as the student's Telegram account, read the
// Ma'had Channel and download a Transcript PDF within Supabase's limits? It
// stores nothing; it answers with what it saw and how long each step took.
//
// Only the service role may call it (the dashboard's Test with the service
// role, or a scheduled job): the channel is the student's, and each call
// signs in to their account.
//
// Secrets (Edge Function secrets, from scripts/telegram-login.mts):
//   TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_CHANNEL_ID

// mtcute's web build, not its Deno one: the Deno build imports `node:sqlite`,
// which Edge Functions don't have, even when its SQLite storage is unused.
// The web build talks to Telegram over WebSocket and uses WebCrypto.
import { MemoryStorage, TelegramClient, WebPlatform } from '@mtcute/web';

// The web platform reads `navigator.onLine`, which Deno doesn't have, and
// would then start out believing it is offline.
class EdgePlatform extends WebPlatform {
  override isOnline(): boolean {
    return true;
  }
}

// How many of the channel's latest posts to look at.
const POSTS = 40;

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The ${name} secret is not set`);
  return value;
}

// The gateway has already checked the token's signature (verify_jwt), so
// only its role is read here.
function isServiceRole(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) return reply(403, { error: 'Only the service role may read the channel' });

  const started = performance.now();
  const timings: Record<string, number> = {};
  const mark = (step: string) => (timings[step] = Math.round(performance.now() - started));

  const tg = new TelegramClient({
    apiId: Number(env('TELEGRAM_API_ID')),
    apiHash: env('TELEGRAM_API_HASH'),
    storage: new MemoryStorage(),
    platform: new EdgePlatform(),
    disableUpdates: true,
  });
  try {
    await tg.importSession(env('TELEGRAM_SESSION'));
    await tg.connect();
    mark('connected');

    // A new in-memory session doesn't know the channel's access hash, so it
    // is found among the account's chats.
    const channelId = Number(env('TELEGRAM_CHANNEL_ID'));
    let channel = null;
    for await (const dialog of tg.iterDialogs()) {
      if (dialog.peer.id === channelId) {
        channel = dialog.peer;
        break;
      }
    }
    if (channel === null) return reply(404, { error: `No chat with id ${channelId}`, timings });
    mark('foundChannel');

    const posts = [];
    let newestPdf = null;
    for await (const message of tg.iterHistory(channel, { limit: POSTS })) {
      const media = message.media;
      const document =
        media?.type === 'document' ? { fileName: media.fileName, mimeType: media.mimeType, size: media.fileSize } : null;
      if (newestPdf === null && media?.type === 'document' && media.mimeType === 'application/pdf') newestPdf = media;
      posts.push({
        id: message.id,
        date: message.date.toISOString(),
        mediaType: media?.type ?? null,
        document,
        text: message.text,
      });
    }
    mark('readPosts');

    let download = null;
    if (newestPdf !== null) {
      const bytes = await tg.downloadAsBuffer(newestPdf);
      download = { fileName: newestPdf.fileName, bytes: bytes.length };
      mark('downloadedPdf');
    }

    return reply(200, { channel: channel.displayName, posts, download, timings });
  } catch (error) {
    mark('failed');
    return reply(500, { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), timings });
  } finally {
    await tg.destroy();
  }
});
