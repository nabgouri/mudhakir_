// Starts question generation for one part of a Lesson (docs/adr/0001).
//
// The phone calls this with the student's Supabase session and a
// `GenerateRequest`. The function checks both, records the part as sent,
// which sets the Lesson to `generating`, keeps the part's Transcript text in
// Supabase for the run (`lesson_part_texts`), and fires the Claude Code
// routine with the request less that text (`FirePayload`) as the fire
// `text`. The routine fetches the text and writes the Questions to Supabase
// itself (routine/fetch-request.ts, routine/write-questions.ts).
//
// A part already sent or done is not fired again, so a phone that sends
// twice (its pull failed) starts one run. A fire that fails takes the part
// back to not sent, and the phone sends it again on a later sync.
//
// Secrets (Edge Function secrets, never in the app or the repo):
//   ROUTINE_ID       the routine's id (trig_…)
//   ROUTINE_TOKEN    the routine's API trigger token (sk-ant-oat01-…)
//   STUDENT_USER_ID  the student's Supabase user id: the routine runs on
//                    their subscription, so no other account may start it
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { GenerateRequest, toFirePayload } from '../../../shared/generation.ts';

const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines';

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The ${name} secret is not set`);
  return value;
}

async function fireRoutine(request: z.infer<typeof GenerateRequest>): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const response = await fetch(`${FIRE_URL}/${env('ROUTINE_ID')}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('ROUTINE_TOKEN')}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: JSON.stringify(toFirePayload(request)) }),
  });
  if (response.ok) return { ok: true };
  return { ok: false, status: response.status, detail: await response.text() };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (token === '') return reply(401, { error: 'Sign in first' });

  // As the student: row-level security keeps them to their own Lessons.
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user.user) return reply(401, { error: 'Sign in first' });
  if (user.user.id !== env('STUDENT_USER_ID')) return reply(403, { error: 'Not the student' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The body is not JSON' });
  }
  const parsed = GenerateRequest.safeParse(body);
  if (!parsed.success) return reply(400, { error: z.prettifyError(parsed.error) });
  const request = parsed.data;

  const { data: start, error: startError } = await supabase.rpc('start_lesson_part', {
    p_lesson_id: request.lessonId,
    p_part_index: request.partIndex,
    p_part_count: request.partCount,
  });
  if (startError) return reply(500, { error: startError.message });
  if (start === null) return reply(404, { error: 'No such Lesson' });
  if (start !== 'fire') return reply(200, { status: start === 'done' ? 'already-done' : 'already-sent' });

  // The part back to not sent (which also drops its kept text), so the phone
  // sends it again on a later sync.
  async function unstart() {
    const { error: unstartError } = await supabase.rpc('unstart_lesson_part', {
      p_lesson_id: request.lessonId,
      p_part_index: request.partIndex,
    });
    if (unstartError) console.error('Taking the part back to not sent failed', unstartError);
  }

  if (request.transcriptText !== undefined) {
    const { error: stashError } = await supabase.rpc('stash_part_text', {
      p_lesson_id: request.lessonId,
      p_part_index: request.partIndex,
      p_text: request.transcriptText,
    });
    if (stashError) {
      console.error('Keeping the Transcript text failed', stashError);
      await unstart();
      return reply(500, { error: stashError.message });
    }
  }

  const fired = await fireRoutine(request).catch((error: Error) => ({ ok: false as const, status: 0, detail: error.message }));
  if (!fired.ok) {
    console.error('Firing the routine failed', fired.status, fired.detail);
    await unstart();
    // 429: an hourly fire limit; the phone tries again on a later sync.
    return reply(fired.status === 429 ? 429 : 502, { error: 'The routine could not be started' });
  }
  return reply(200, { status: 'generating' });
});
