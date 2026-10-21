// Tells the student's phones that a Lesson's status changed to ready or
// failed, so they sync now (docs/setup-push.md).
//
// Called by the `lessons_notify_status` trigger, not by the phone, so it
// checks a shared secret instead of a user's session. It sends each of the
// owner's Expo push tokens a data-only push: no title or body, so nothing
// shows by itself, but it wakes the app's background task, which syncs. The
// sync then shows "Questions ready" as it does when the app is opened.
//
// Secrets (Edge Function secrets):
//   NOTIFY_READY_SECRET  the same value as Vault's `notify_ready_secret`
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const Body = z.object({
  lessonId: z.uuid(),
  owner: z.uuid(),
  status: z.enum(['ready', 'failed']),
});

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The ${name} secret is not set`);
  return value;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (req.headers.get('x-notify-secret') !== env('NOTIFY_READY_SECRET')) return reply(401, { error: 'Wrong secret' });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: z.prettifyError(parsed.error) });
  const { lessonId, owner, status } = parsed.data;

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await supabase.from('push_tokens').select('token').eq('owner', owner);
  if (error) return reply(500, { error: error.message });
  if (rows.length === 0) return reply(200, { sent: 0 });

  // High priority, so Android delivers it to a sleeping phone promptly.
  const messages = rows.map(({ token }) => ({ to: token, data: { lessonId, status }, priority: 'high' }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    console.error('Expo refused the push', response.status, await response.text());
    return reply(502, { error: 'The push could not be sent' });
  }

  // Tickets come back in the order of the messages. A token Expo no longer
  // knows (the app was uninstalled) is dropped.
  const { data: tickets } = (await response.json()) as { data: Ticket[] };
  const gone: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'ok') return;
    if (ticket.details?.error === 'DeviceNotRegistered') gone.push(messages[i].to);
    else console.error('A push was refused', ticket.message, ticket.details);
  });
  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from('push_tokens').delete().in('token', gone);
    if (deleteError) console.error('Dropping unknown tokens failed', deleteError);
  }
  return reply(200, { sent: tickets.filter((ticket) => ticket.status === 'ok').length });
});
