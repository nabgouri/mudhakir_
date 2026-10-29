// Sending one part of a Lesson for generation (docs/adr/0001): record it as
// sent, which sets the Lesson to `generating`, keep its Transcript text for
// the run, and fire the Claude Code routine with the request less that text
// (`FirePayload`). The routine fetches the text and writes the Questions to
// Supabase itself.
//
// Used by `generate-lesson` (the phone's Lessons, as the student) and
// `channel-reader` (the Ma'had Channel's, as the service role); each keeps
// the text its own way.
//
// A part already sent or done is not fired again. A fire that fails takes
// the part back to not sent, so it is sent again later.
//
// Secrets: ROUTINE_ID (trig_…) and ROUTINE_TOKEN (sk-ant-oat01-…).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { type GenerateRequest, toFirePayload } from '../../../shared/generation.ts';

const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines';

export type Request = z.infer<typeof GenerateRequest>;

export type SendResult =
  | { status: 'generating' | 'already-done' | 'already-sent' }
  | { status: 'no-lesson' }
  // 429: the routine's hourly fire limit; the part is sent again later.
  | { status: 'failed'; httpStatus: number; error: string };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`The ${name} secret is not set`);
  return value;
}

async function fireRoutine(request: Request): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
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

// `keepText` stores the part's Transcript text for the run, or returns the
// error that stopped it.
export async function sendPart(
  supabase: SupabaseClient,
  request: Request,
  keepText: (text: string) => Promise<string | null>,
): Promise<SendResult> {
  const { data: start, error: startError } = await supabase.rpc('start_lesson_part', {
    p_lesson_id: request.lessonId,
    p_part_index: request.partIndex,
    p_part_count: request.partCount,
  });
  if (startError) return { status: 'failed', httpStatus: 500, error: startError.message };
  if (start === null) return { status: 'no-lesson' };
  if (start !== 'fire') return { status: start === 'done' ? 'already-done' : 'already-sent' };

  // The part back to not sent (which also drops its kept text).
  async function unstart() {
    const { error } = await supabase.rpc('unstart_lesson_part', {
      p_lesson_id: request.lessonId,
      p_part_index: request.partIndex,
    });
    if (error) console.error('Taking the part back to not sent failed', error);
  }

  if (request.transcriptText !== undefined) {
    const keepError = await keepText(request.transcriptText);
    if (keepError !== null) {
      console.error('Keeping the Transcript text failed', keepError);
      await unstart();
      return { status: 'failed', httpStatus: 500, error: keepError };
    }
  }

  const fired = await fireRoutine(request).catch((error: Error) => ({ ok: false as const, status: 0, detail: error.message }));
  if (!fired.ok) {
    console.error('Firing the routine failed', fired.status, fired.detail);
    await unstart();
    return { status: 'failed', httpStatus: fired.status === 429 ? 429 : 502, error: 'The routine could not be started' };
  }
  return { status: 'generating' };
}
