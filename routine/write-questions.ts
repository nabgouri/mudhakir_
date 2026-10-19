// The routine's write script (.claude/skills/generate-lesson-questions/).
// It checks the routine's output against the shared contract and stores it
// in Supabase, or records that the part failed.
//
//   npx tsx routine/write-questions.ts <output.json>
//   npx tsx routine/write-questions.ts --fail <lessonId> <partIndex> <reason>
//
// Storing replaces the (lesson, part) pair's Questions and marks the part
// done in one transaction (`finish_lesson_part`, supabase/migrations/), so
// running it again never duplicates Questions. Output that fails the check
// marks the part failed; fixing the file and running again marks it done.
//
// SUPABASE_URL names the project. The service-role key is a network secret
// of the routine's environment: the agent proxy adds it to requests for the
// Supabase host, so it is never in this session. Run anywhere else, the key
// is read from SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { GeneratedQuestions, toQuestionRecord } from '../shared/generation';

async function rpc(name: string, args: Record<string, unknown>): Promise<string> {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Set SUPABASE_URL to the Supabase project URL (https://<project-ref>.supabase.co).');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (key) {
    headers.apikey = key;
    // A legacy service_role key is a JWT and also goes in Authorization; a
    // secret key (sb_secret_…) goes in apikey only.
    if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${text}`);
  return JSON.parse(text) as string;
}

async function fail(lessonId: string, partIndex: number, reason: string): Promise<void> {
  const status = await rpc('fail_lesson_part', { p_lesson_id: lessonId, p_part_index: partIndex, p_error: reason });
  console.log(`Recorded part ${partIndex} of Lesson ${lessonId} as failed. The Lesson is now ${status}.`);
}

async function write(path: string): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${path} as JSON: ${(error as Error).message}`);
    return false;
  }

  const parsed = GeneratedQuestions.safeParse(raw);
  if (!parsed.success) {
    const problems = z.prettifyError(parsed.error);
    console.error(`The output does not match GeneratedQuestions (shared/generation.ts):\n${problems}`);
    // Record the failure when the file at least says which part it is.
    const target = z.object({ lessonId: z.uuid(), partIndex: z.number().int().min(0) }).safeParse(raw);
    if (target.success) await fail(target.data.lessonId, target.data.partIndex, `Invalid output:\n${problems}`);
    return false;
  }

  const { lessonId, partIndex, questions } = parsed.data;
  const status = await rpc('finish_lesson_part', {
    p_lesson_id: lessonId,
    p_part_index: partIndex,
    p_questions: questions.map(toQuestionRecord),
  });
  console.log(`Stored ${questions.length} Questions for part ${partIndex} of Lesson ${lessonId}. The Lesson is now ${status}.`);
  return true;
}

async function main(args: string[]): Promise<boolean> {
  if (args[0] === '--fail' && args.length === 4) {
    const partIndex = Number(args[2]);
    if (!z.uuid().safeParse(args[1]).success || !Number.isInteger(partIndex) || partIndex < 0) {
      console.error('Usage: --fail <lessonId (UUID)> <partIndex (0, 1, …)> <reason>');
      return false;
    }
    await fail(args[1], partIndex, args[3]);
    return true;
  }
  if (args.length === 1 && !args[0].startsWith('--')) return write(args[0]);
  console.error(
    'Usage:\n  npx tsx routine/write-questions.ts <output.json>\n  npx tsx routine/write-questions.ts --fail <lessonId> <partIndex> <reason>',
  );
  return false;
}

main(process.argv.slice(2)).then(
  (ok) => process.exit(ok ? 0 : 1),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
