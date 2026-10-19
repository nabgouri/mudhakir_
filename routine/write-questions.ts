// The routine's write script (.claude/skills/generate-lesson-questions/).
// It checks the routine's output against the shared contract and against
// the request it answers (same Lesson and part, only that part's material,
// Transcript Source Passages word for word), and stores it in Supabase, or
// records that the part failed.
//
//   npx tsx routine/write-questions.ts <output.json> <request.json>
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

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { GenerateRequest, GeneratedQuestions, problemsWithOutput, toQuestionRecord } from '../shared/generation';

async function supabase(path: string, init: RequestInit = {}): Promise<unknown> {
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
  const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

async function rpc(name: string, args: Record<string, unknown>): Promise<string> {
  return (await supabase(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })) as string;
}

// Whether `text` is the part's Transcript text the phone sent: its SHA-256
// matches the digest the phone stored for the part (`transcript_digests`).
// The request file is the routine's own copy of the payload, so this
// catches a copy that changed on the way.
async function isSentTranscript(lessonId: string, partIndex: number, text: string): Promise<boolean> {
  const rows = (await supabase(`lessons?id=eq.${lessonId}&select=transcript_digests`)) as {
    transcript_digests: string[];
  }[];
  const sent = rows[0]?.transcript_digests[partIndex];
  return sent !== undefined && sent === createHash('sha256').update(text, 'utf8').digest('hex');
}

async function fail(lessonId: string, partIndex: number, reason: string): Promise<void> {
  const status = await rpc('fail_lesson_part', { p_lesson_id: lessonId, p_part_index: partIndex, p_error: reason });
  console.log(`Recorded part ${partIndex} of Lesson ${lessonId} as failed. The Lesson is now ${status}.`);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${path} as JSON: ${(error as Error).message}`);
    return undefined;
  }
}

async function write(outputPath: string, requestPath: string): Promise<boolean> {
  const raw = readJson(outputPath);
  const rawRequest = readJson(requestPath);
  if (raw === undefined || rawRequest === undefined) return false;

  const request = GenerateRequest.safeParse(rawRequest);
  if (!request.success) {
    console.error(`${requestPath} is not the GenerateRequest from the payload:\n${z.prettifyError(request.error)}`);
    return false;
  }
  const { lessonId: requestLesson, partIndex: requestPart, transcriptText } = request.data;
  if (transcriptText !== undefined && !(await isSentTranscript(requestLesson, requestPart, transcriptText))) {
    console.error(
      `The transcriptText in ${requestPath} is not the text the phone sent for this part. Save the payload's JSON to it again, exactly as it is.`,
    );
    return false;
  }

  // Records the failure against the part the request names.
  async function invalid(problems: string): Promise<false> {
    console.error(problems);
    await fail(requestLesson, requestPart, `Invalid output:\n${problems}`);
    return false;
  }
  const parsed = GeneratedQuestions.safeParse(raw);
  if (!parsed.success) {
    return invalid(`The output does not match GeneratedQuestions (shared/generation.ts):\n${z.prettifyError(parsed.error)}`);
  }
  const problems = problemsWithOutput(request.data, parsed.data);
  if (problems.length > 0) {
    return invalid(`The output does not answer the request:\n${problems.map((p) => `✖ ${p}`).join('\n')}`);
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
  if (args.length === 2 && !args.some((arg) => arg.startsWith('--'))) return write(args[0], args[1]);
  console.error(
    'Usage:\n  npx tsx routine/write-questions.ts <output.json> <request.json>\n  npx tsx routine/write-questions.ts --fail <lessonId> <partIndex> <reason>',
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
