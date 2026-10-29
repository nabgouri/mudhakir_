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

import { GenerateRequest } from '../../../shared/generation.ts';
import { sendPart } from '../_shared/send-part.ts';

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

  const result = await sendPart(supabase, request, async (text) => {
    const { error } = await supabase.rpc('stash_part_text', {
      p_lesson_id: request.lessonId,
      p_part_index: request.partIndex,
      p_text: text,
    });
    return error?.message ?? null;
  });
  if (result.status === 'no-lesson') return reply(404, { error: 'No such Lesson' });
  // A failed part is back to not sent, so the phone sends it again on a
  // later sync.
  if (result.status === 'failed') return reply(result.httpStatus, { error: result.error });
  return reply(200, { status: result.status });
});
