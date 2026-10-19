import { questionFromRow } from '../../src/data/question-row';
import { GenerateRequest, GeneratedQuestions, MAX_REQUEST_TEXT, toQuestionRecord } from '../generation';
import interactiveReviewOutput from './fixtures/interactive-review-output.json';
import interactiveReviewRequest from './fixtures/interactive-review-request.json';

// The generation contract (seam 2). The Edge Function, the routine's write
// script and the app all import this schema, so these fixtures check all
// three.

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// The fixture with its questions changed by `edit`.
function outputWith(edit: (questions: Record<string, unknown>[]) => void) {
  const output = clone(interactiveReviewOutput) as { questions: Record<string, unknown>[] };
  edit(output.questions);
  return output;
}

describe('GeneratedQuestions', () => {
  test('a routine output from an Interactive Review passes', () => {
    const result = GeneratedQuestions.safeParse(interactiveReviewOutput);
    expect(result.error).toBeUndefined();
    expect(result.data?.questions).toHaveLength(5);
  });

  test('an Interactive Review question with 6 options passes unchanged', () => {
    const output = GeneratedQuestions.parse(interactiveReviewOutput);
    const sixOptions = output.questions[2];
    expect(sixOptions.kind === 'multiple-choice' && sixOptions.options).toHaveLength(6);
  });

  test('a true/false question copied as an Open Question passes', () => {
    const output = GeneratedQuestions.parse(interactiveReviewOutput);
    expect(output.questions[3]).toMatchObject({ kind: 'open', origin: 'interactive-review', answer: 'صح' });
  });

  test('a Transcript Question with its source passage passes', () => {
    const output = outputWith((questions) => {
      questions.push({
        kind: 'open',
        origin: 'transcript',
        prompt: 'ما حكم الوضوء بالماء المتغيِّر بطول المُكث؟',
        answer: 'يجوز، لأنه لم يخرج عن اسم الماء المطلق.',
        sourcePassage: 'والماءُ المتغيِّرُ بطول المُكث طَهورٌ، لأنه لم يخرج عن اسم الماء المطلق.',
      });
    });
    expect(GeneratedQuestions.safeParse(output).success).toBe(true);
  });

  test.each<[string, (questions: Record<string, unknown>[]) => void]>([
    ['an Open Question without an answer', (q) => delete q[0].answer],
    ['an Open Question with an empty answer', (q) => (q[0].answer = '  ')],
    ['a Multiple-Choice Question without its correct option', (q) => delete q[2].correctOption],
    ['a correct option that is not one of the options', (q) => (q[1].correctOption = 3)],
    ['a Multiple-Choice Question with one option', (q) => (q[2].options = ['ماء البحر'])],
    ['a Multiple-Choice Question with no options', (q) => (q[2].options = [])],
    ['a concept-card Question without a source passage', (q) => delete q[0].sourcePassage],
    ['a concept-card Question with an empty source passage', (q) => (q[1].sourcePassage = '')],
    [
      'a Transcript Question without a source passage',
      (q) => q.push({ kind: 'open', origin: 'transcript', prompt: 'ما تعريف الطهارة شرعًا؟', answer: 'ارتفاع الحدث.' }),
    ],
    ['an Interactive Review question given a source passage', (q) => (q[3].sourcePassage = 'نص')],
    ['an unknown kind', (q) => (q[3].kind = 'true-false')],
    ['an unknown origin', (q) => (q[3].origin = 'teacher')],
    ['a null prompt', (q) => (q[0].prompt = null)],
    ['an empty prompt', (q) => (q[0].prompt = '')],
    ['an unexpected field', (q) => (q[0].ruling = 'واجب')],
  ])('rejects %s', (_, edit) => {
    expect(GeneratedQuestions.safeParse(outputWith(edit)).success).toBe(false);
  });

  test('rejects output that names no lesson', () => {
    const { lessonId: _, ...output } = clone(interactiveReviewOutput);
    expect(GeneratedQuestions.safeParse(output).success).toBe(false);
  });
});

describe('GenerateRequest', () => {
  test('an Interactive-Review-only request passes', () => {
    expect(GenerateRequest.safeParse(interactiveReviewRequest).error).toBeUndefined();
  });

  test('a Transcript-only part and a later part of a multi-part request pass', () => {
    const { interactiveReviewUrl: _, ...base } = interactiveReviewRequest;
    const transcriptText = 'الطَّهارة لغةً: النَّظافة والنَّزاهة عن الأقذار.\n\nوشرعًا: ارتفاع الحدث وزوال الخبث.';
    expect(GenerateRequest.safeParse({ ...base, transcriptText }).success).toBe(true);
    expect(GenerateRequest.safeParse({ ...base, transcriptText, partIndex: 2, partCount: 3 }).success).toBe(true);
    expect(
      GenerateRequest.safeParse({ ...interactiveReviewRequest, transcriptText, partIndex: 0, partCount: 3 }).success,
    ).toBe(true);
  });

  test.each<[string, Record<string, unknown>]>([
    ['no material to generate from', { interactiveReviewUrl: undefined }],
    ['an address that is not a web address', { interactiveReviewUrl: 'المذاكرة التفاعلية' }],
    ['an address without a host', { interactiveReviewUrl: 'https://' }],
    ['a non-web address', { interactiveReviewUrl: 'javascript:alert(1)' }],
    ['the Interactive Review on a later part', { partIndex: 1, partCount: 2 }],
    ['a part index past the part count', { partIndex: 1, partCount: 1 }],
    ['no parts', { partCount: 0 }],
    ['a lesson id that is not a UUID', { lessonId: '42' }],
    ['an empty subject name', { subjectName: ' ' }],
    ['lesson number 0', { lessonNumber: 0 }],
    ['an unexpected field', { pdf: 'base64…' }],
  ])('rejects %s', (_, change) => {
    expect(GenerateRequest.safeParse({ ...interactiveReviewRequest, ...change }).success).toBe(false);
  });

  test('rejects a part whose serialized request would not fit the routine trigger', () => {
    const transcriptText = 'ب'.repeat(MAX_REQUEST_TEXT);
    expect(GenerateRequest.safeParse({ ...interactiveReviewRequest, transcriptText }).success).toBe(false);
  });
});

describe('what the Review Session shows', () => {
  // The write script stores each Question as `toQuestionRecord` makes it;
  // sync brings the row to the phone with `options` as JSON text; the Review
  // Session shows what `questionFromRow` reads from that row.
  const shown = GeneratedQuestions.parse(interactiveReviewOutput).questions.map((question, i) => {
    const record = toQuestionRecord(question);
    return questionFromRow({
      id: `q${i}`,
      lessonId: interactiveReviewOutput.lessonId,
      subjectId: 'subject',
      lessonNumber: 3,
      kind: record.kind,
      prompt: record.prompt,
      options: record.options === null ? null : JSON.stringify(record.options),
      correctOption: record.correct_option,
      answer: record.answer,
      sourcePassage: record.source_passage,
    });
  });

  test('a Concept Card Question shows its answer and the card text as its Source Passage', () => {
    expect(shown[0]).toMatchObject({
      kind: 'open',
      prompt: 'ما تعريف الطَّهارة لغةً؟',
      answer: 'النَّظافة والنَّزاهة عن الأقذار.',
      sourcePassage: 'الطَّهارة لغةً: النَّظافة والنَّزاهة عن الأقذار.',
    });
  });

  test('an Interactive Review question shows all its options, the right one marked, and no Source Passage', () => {
    const question = shown[2];
    expect(question).toMatchObject({ kind: 'multiple-choice', correctOption: 2, sourcePassage: null });
    expect(question.kind === 'multiple-choice' && question.options).toEqual(interactiveReviewOutput.questions[2].options);
  });

  test('a true/false question shows as an Open Question with its original wording', () => {
    expect(shown[3]).toMatchObject({
      kind: 'open',
      prompt: 'صح أم خطأ: الماء الطَّهور هو الباقي على خِلقته.',
      answer: 'صح',
      sourcePassage: null,
    });
  });
});
