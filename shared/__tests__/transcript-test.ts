import { GenerateRequest, MAX_REQUEST_TEXT } from '../generation';
import { paragraphs, serializedLength, splitTranscript, transcriptRoom } from '../transcript';
import multiPartRequests from './fixtures/multi-part-requests.json';

// Splitting a Transcript into parts that fit the routine's trigger.

const joined = (parts: string[]) => parts.join('\n\n');
const withoutSpaces = (text: string) => text.replace(/\s+/g, '');

// A Transcript of `count` numbered paragraphs, each about `length` characters.
function transcript(count: number, length: number): string {
  const sentence = 'قال المصنف رحمه الله: المياهُ ثلاثةٌ: طَهورٌ، وطاهرٌ، ونَجِسٌ. ';
  return Array.from({ length: count }, (_, i) => `(${i + 1}) ${sentence.repeat(Math.ceil(length / sentence.length))}`.slice(0, length).trim())
    .join('\n\n');
}

describe('splitTranscript', () => {
  test('a Transcript that fits is one part, unchanged', () => {
    const text = 'الطَّهارة لغةً: النَّظافة.\n\nوشرعًا: ارتفاع الحدث.';
    expect(splitTranscript(text, 1000)).toEqual([text]);
  });

  test.each([
    [40, 4000, 65_000],
    [300, 900, 20_000],
    [7, 9000, 10_000],
  ])('%i paragraphs of about %i characters stay under %i per part, break only between paragraphs and lose no text', (count, length, limit) => {
    const text = transcript(count, length);
    const parts = splitTranscript(text, limit);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(serializedLength(part)).toBeLessThanOrEqual(limit);
    // Every part is whole paragraphs: none starts or ends mid-paragraph.
    const all = paragraphs(text);
    expect(parts.flatMap(paragraphs)).toEqual(all);
    expect(joined(parts)).toBe(all.join('\n\n'));
  });

  test('parts are as full as the limit allows', () => {
    const parts = splitTranscript(transcript(10, 1000), 2500);
    // Two paragraphs and the blank line between them fit; three don't.
    expect(parts.map(paragraphs).map((p) => p.length)).toEqual([2, 2, 2, 2, 2]);
  });

  test('line breaks and quotes count as JSON writes them', () => {
    const text = `${'"س"\n'.repeat(200)}\n\n${'"ص"\n'.repeat(200)}`;
    for (const part of splitTranscript(text, 1200)) expect(JSON.stringify(part).length - 2).toBeLessThanOrEqual(1200);
  });

  test('blank lines with spaces, several blank lines and Windows line endings all separate paragraphs', () => {
    expect(paragraphs('أ\r\n \r\nب\n\n\n\nج\n\t\nد\nهـ')).toEqual(['أ', 'ب', 'ج', 'د\nهـ']);
  });

  test('a paragraph longer than the limit is cut at its line breaks, then its sentences, losing no words', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `السطر ${i + 1}: والطاهر هو ما تغيَّر كثيرٌ من لونه أو طعمه أو ريحه بشيءٍ طاهرٍ.`);
    const longParagraph = lines.join('\n');
    const parts = splitTranscript(`مقدمة.\n\n${longParagraph}\n\nخاتمة.`, 600);
    for (const part of parts) expect(serializedLength(part)).toBeLessThanOrEqual(600);
    expect(withoutSpaces(joined(parts))).toBe(withoutSpaces(`مقدمة.${longParagraph}خاتمة.`));
    // Each cut is at a line break, so every line is whole.
    for (const line of lines) expect(parts.some((part) => part.includes(line))).toBe(true);

    const oneLine = lines.join(' ');
    const sentences = splitTranscript(oneLine, 600);
    expect(withoutSpaces(joined(sentences))).toBe(withoutSpaces(oneLine));
    for (const part of sentences) expect(part.endsWith('.')).toBe(true);
  });

  test('an empty Transcript has no parts', () => {
    expect(splitTranscript(' \n\n ', 1000)).toEqual([]);
  });
});

describe('transcriptRoom', () => {
  test('every part split to the room makes a request that fits the routine trigger', () => {
    const [first] = multiPartRequests;
    const { transcriptText: _, partIndex: __, partCount: ___, ...fields } = first;
    const room = transcriptRoom(fields);
    expect(room).toBeLessThan(MAX_REQUEST_TEXT);
    const parts = splitTranscript(transcript(80, 3000), room);
    parts.forEach((transcriptText, partIndex) => {
      const request = {
        ...fields,
        interactiveReviewUrl: partIndex === 0 ? fields.interactiveReviewUrl : undefined,
        transcriptText,
        partIndex,
        partCount: parts.length,
      };
      expect(GenerateRequest.safeParse(request).error).toBeUndefined();
    });
  });
});
