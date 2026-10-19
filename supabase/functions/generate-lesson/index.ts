// Starts question generation for one part of a Lesson (docs/adr/0001).
//
// The phone calls this with the student's Supabase session and a
// `GenerateRequest`. The function checks both, fires the Claude Code routine
// with the serialized request as the fire `text`, and records the part as
// sent, which sets the Lesson to `generating`. The routine then writes the
// Questions to Supabase itself (routine/write-questions.ts).
//
// The routine is fired before the Lesson is marked, so a fire that fails
// leaves the Lesson `waiting` and the phone sends it again on its next sync.
//
// Secrets (Edge Function secrets, never in the app or the repo):
//   ROUTINE_ID     the routine's id (trig_…)
//   ROUTINE_TOKEN  the routine's API trigger token (sk-ant-oat01-…)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { GenerateRequest } from '../../../shared/generation.ts';

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
    body: JSON.stringify({ text: JSON.stringify(request) }),
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The body is not JSON' });
  }
  const parsed = GenerateRequest.safeParse(body);
  if (!parsed.success) return reply(400, { error: z.prettifyError(parsed.error) });
  const request = parsed.data;

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('parts_done')
    .eq('id', request.lessonId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lessonError) return reply(500, { error: lessonError.message });
  if (lesson === null) return reply(404, { error: 'No such Lesson' });
  if ((lesson.parts_done as number[]).includes(request.partIndex)) return reply(200, { status: 'already-done' });

  const fired = await fireRoutine(request);
  if (!fired.ok) {
    console.error('Firing the routine failed', fired.status, fired.detail);
    // 429: an hourly fire limit; the phone tries again on a later sync.
    return reply(fired.status === 429 ? 429 : 502, { error: 'The routine could not be started' });
  }

  const { data: status, error: sentError } = await supabase.rpc('lesson_part_sent', {
    p_lesson_id: request.lessonId,
    p_part_index: request.partIndex,
    p_part_count: request.partCount,
  });
  // The routine is running and will set the Lesson's status when it writes.
  if (sentError) console.error('Recording the part as sent failed', sentError);
  return reply(200, { status: status ?? 'generating' });
});
