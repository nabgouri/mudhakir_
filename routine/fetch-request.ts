// The routine's first script (.claude/skills/generate-lesson-questions/).
// It turns the trigger's payload (`FirePayload`, saved to a file) into the
// full `GenerateRequest`, fetching the part's Transcript text from Supabase
// (`lesson_part_texts`, kept there by the Edge Function for this run) and
// checking it against the digest the phone stored. The text never passes
// through the model, so it arrives exactly as the phone sent it.
//
//   npx tsx routine/fetch-request.ts <payload.json> <request.json>
//
// When the part's text can't be had, it records the part as failed with
// the reason, so the app can offer to send it again.

import { readFileSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { FirePayload, GenerateRequest } from '../shared/generation';

import { fail, isSentTranscript, supabase } from './supabase';

async function partText(lessonId: string, partIndex: number): Promise<string | undefined> {
  const rows = (await supabase(
    `lesson_part_texts?lesson_id=eq.${lessonId}&part_index=eq.${partIndex}&select=text`,
  )) as { text: string }[];
  return rows[0]?.text;
}

async function main(args: string[]): Promise<boolean> {
  if (args.length !== 2) {
    console.error('Usage: npx tsx routine/fetch-request.ts <payload.json> <request.json>');
    return false;
  }
  const [payloadPath, requestPath] = args;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(payloadPath, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    console.error(`Could not read ${payloadPath} as JSON: ${(error as Error).message}`);
    return false;
  }
  const payload = FirePayload.safeParse(raw);
  if (!payload.success) {
    console.error(`${payloadPath} is not the routine-fire-payload's FirePayload:\n${z.prettifyError(payload.error)}`);
    return false;
  }
  const { hasTranscript, ...rest } = payload.data;
  const { lessonId, partIndex } = rest;

  let transcriptText: string | undefined;
  if (hasTranscript) {
    transcriptText = await partText(lessonId, partIndex);
    if (transcriptText === undefined) {
      await fail(lessonId, partIndex, 'The Transcript text for this part was not in Supabase; send it again from the app');
      return false;
    }
    if (!(await isSentTranscript(lessonId, partIndex, transcriptText))) {
      await fail(lessonId, partIndex, "The kept Transcript text does not match the phone's digest; send it again from the app");
      return false;
    }
  }

  const request = GenerateRequest.safeParse({ ...rest, transcriptText });
  if (!request.success) {
    await fail(lessonId, partIndex, `The request is not valid: ${z.prettifyError(request.error)}`);
    return false;
  }
  writeFileSync(requestPath, JSON.stringify(request.data, null, 2), 'utf8');
  console.log(
    `Wrote ${requestPath} for part ${partIndex} of Lesson ${lessonId}` +
      (transcriptText === undefined ? ', with no Transcript text.' : `, with ${transcriptText.length} characters of Transcript text.`),
  );
  return true;
}

main(process.argv.slice(2)).then(
  (ok) => process.exit(ok ? 0 : 1),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
