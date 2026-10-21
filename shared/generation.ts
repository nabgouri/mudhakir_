// The lesson-generation contract: what the app asks the routine to do
// (`GenerateRequest`), what the routine's trigger carries (`FirePayload`)
// and what the routine hands back (`GeneratedQuestions`). This one module is
// imported by the app, the `generate-lesson` Edge Function
// (supabase/functions/) and the routine's scripts (routine/), so all of them
// check the same shapes. It depends only on `zod` and must stay plain
// TypeScript that Node, Deno and Metro can all load.

import { z } from 'zod';

// The most one run is given: a longer Transcript is split into parts, each
// its own run, so the routine reads a part whole.
export const MAX_REQUEST_TEXT = 65_000;

// An http or https address with a host. Checked with a pattern rather than
// `z.url()` so it behaves the same on the phone as in Node and Deno.
const HTTP_URL = /^https?:\/\/[^\s/?#]+\.[^\s/?#]+([/?#]\S*)?$/i;

// The web address of a Lesson's Interactive Review.
export const InteractiveReviewUrl = z.string().regex(HTTP_URL);

// Text that shows something: not empty or only spaces.
const Text = z.string().trim().min(1);

const PartIndex = z.number().int().min(0);

// One run of the routine. A Lesson's material is sent in `partCount` parts;
// a long Transcript is split across them. Only the first part (index 0)
// carries the Interactive Review, so its page is read once.
export const GenerateRequest = z
  .object({
    lessonId: z.uuid(),
    subjectName: Text,
    lessonNumber: z.number().int().min(1),
    interactiveReviewUrl: InteractiveReviewUrl.optional(),
    transcriptText: Text.optional(),
    partIndex: PartIndex,
    partCount: z.number().int().min(1),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.partIndex >= request.partCount) {
      ctx.addIssue({ code: 'custom', path: ['partIndex'], message: 'partIndex must be less than partCount' });
    }
    if (request.interactiveReviewUrl !== undefined && request.partIndex !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['interactiveReviewUrl'],
        message: 'only the first part carries the Interactive Review',
      });
    }
    if (request.interactiveReviewUrl === undefined && request.transcriptText === undefined) {
      ctx.addIssue({ code: 'custom', message: 'a part needs an Interactive Review or Transcript text' });
    }
    if (JSON.stringify(request).length > MAX_REQUEST_TEXT) {
      ctx.addIssue({ code: 'custom', message: `the serialized request is over ${MAX_REQUEST_TEXT} characters` });
    }
  });

export type GenerateRequestInput = z.input<typeof GenerateRequest>;

// What the routine's trigger carries: the request without its Transcript
// text. The routine is a model, and a model can't copy tens of thousands of
// characters exactly, so the Edge Function keeps the text in Supabase for
// the run and the routine fetches it by script (routine/fetch-request.ts),
// which rebuilds the `GenerateRequest`.
export const FirePayload = z
  .object({
    lessonId: z.uuid(),
    subjectName: Text,
    lessonNumber: z.number().int().min(1),
    interactiveReviewUrl: InteractiveReviewUrl.optional(),
    hasTranscript: z.boolean(),
    partIndex: PartIndex,
    partCount: z.number().int().min(1),
  })
  .strict();

export function toFirePayload(request: z.output<typeof GenerateRequest>): z.output<typeof FirePayload> {
  const { transcriptText, ...rest } = request;
  return { ...rest, hasTranscript: transcriptText !== undefined };
}

// Where a Question came from. A Question copied from the Interactive Review
// has no Source Passage; one written from a Concept Card or the Transcript
// keeps the passage it was drawn from, word for word.
export const Origin = z.enum(['interactive-review', 'concept-card', 'transcript']);

const Common = {
  origin: Origin,
  prompt: Text,
  sourcePassage: Text.optional(),
};

// Options are copied as the ma'had wrote them, so there is no upper limit.
const MultipleChoice = z
  .object({
    kind: z.literal('multiple-choice'),
    ...Common,
    options: z.array(Text).min(2),
    correctOption: z.number().int().min(0),
  })
  .strict()
  .refine((q) => q.correctOption < q.options.length, {
    path: ['correctOption'],
    message: 'correctOption must point at one of the options',
  });

// An Interactive Review question in any other format (true/false, matching)
// is copied as an Open Question with its own wording and answer.
const Open = z
  .object({
    kind: z.literal('open'),
    ...Common,
    answer: Text,
  })
  .strict();

export const GeneratedQuestion = z.discriminatedUnion('kind', [MultipleChoice, Open]).superRefine((q, ctx) => {
  if (q.origin === 'interactive-review' && q.sourcePassage !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourcePassage'],
      message: 'a Question copied from the Interactive Review has no source passage',
    });
  }
  if (q.origin !== 'interactive-review' && q.sourcePassage === undefined) {
    ctx.addIssue({ code: 'custom', path: ['sourcePassage'], message: `a ${q.origin} Question needs its source passage` });
  }
});

// One run's output: the Questions for one (lesson, part) pair. They replace
// whatever an earlier run of the same part wrote.
export const GeneratedQuestions = z
  .object({
    lessonId: z.uuid(),
    partIndex: PartIndex,
    questions: z.array(GeneratedQuestion),
  })
  .strict();

// Text compared for "word for word": the same letters and diacritics, in
// NFC, with any run of spaces and line breaks counted as one space, since a
// line break in the extracted PDF text is often just the end of a printed
// line.
function comparable(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// A Source Passage quotes at least a phrase, so the student can find it.
const MIN_PASSAGE_WORDS = 2;

// What is wrong with `output` as the answer to `request`, beyond its shape:
// it must be for the same Lesson and part, draw only on the material the
// request carried, and quote each Transcript Source Passage word for word
// from this part's text. The write script checks this before storing.
export function problemsWithOutput(
  request: z.output<typeof GenerateRequest>,
  output: z.output<typeof GeneratedQuestions>,
): string[] {
  const problems: string[] = [];
  if (output.lessonId !== request.lessonId) problems.push(`lessonId is not the request's (${request.lessonId})`);
  if (output.partIndex !== request.partIndex) problems.push(`partIndex is not the request's (${request.partIndex})`);
  const transcript = request.transcriptText === undefined ? null : comparable(request.transcriptText);
  output.questions.forEach((question, i) => {
    const where = `questions[${i}]`;
    if (question.origin === 'transcript') {
      if (transcript === null) problems.push(`${where} is from the Transcript, but this part has no Transcript text`);
      else if (comparable(question.sourcePassage ?? '').split(' ').length < MIN_PASSAGE_WORDS) {
        problems.push(`${where}: the source passage is too short to show where the point came from`);
      } else if (!transcript.includes(comparable(question.sourcePassage ?? ''))) {
        problems.push(`${where}: the source passage is not word for word in this part's Transcript text`);
      }
    } else if (request.interactiveReviewUrl === undefined) {
      problems.push(`${where} is from the Interactive Review (${question.origin}), but this part does not carry it`);
    }
  });
  return problems;
}

// A Question as the `questions` table stores it, in the cloud and on the
// phone (where `options` is the same JSON as text).
export type QuestionRecord = {
  kind: 'multiple-choice' | 'open';
  origin: z.infer<typeof Origin>;
  prompt: string;
  options: string[] | null;
  correct_option: number | null;
  answer: string | null;
  source_passage: string | null;
};

// Text is stored in NFC, so stacked diacritics (shadda with a vowel) are
// always in one order, like the text the student types.
function stored(text: string): string {
  return text.normalize('NFC').trim();
}

export function toQuestionRecord(q: z.infer<typeof GeneratedQuestion>): QuestionRecord {
  const base = {
    origin: q.origin,
    prompt: stored(q.prompt),
    source_passage: q.sourcePassage === undefined ? null : stored(q.sourcePassage),
  };
  return q.kind === 'multiple-choice'
    ? { ...base, kind: q.kind, options: q.options.map(stored), correct_option: q.correctOption, answer: null }
    : { ...base, kind: q.kind, options: null, correct_option: null, answer: stored(q.answer) };
}
