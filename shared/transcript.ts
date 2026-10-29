// Splitting a Transcript's text into parts that each fit one routine run.
// The app splits on the phone, then sends one `GenerateRequest` per part
// (shared/generation.ts), so every part must leave room in the serialized
// request for the request's other fields.

import { MAX_REQUEST_TEXT, type GenerateRequestInput } from './generation.ts';

const PARAGRAPH_BREAK = '\n\n';

// How many characters `text` takes inside a serialized request: JSON writes
// a line break or a quote as two characters, a control character as six.
export function serializedLength(text: string): number {
  return JSON.stringify(text).length - 2;
}

const BREAK_COST = serializedLength(PARAGRAPH_BREAK);

// The room left for one part's Transcript text in a request with these
// fields. The Interactive Review address only goes with the first part, so counting
// it gives the room every part can use; the part numbers are counted at
// their widest.
export function transcriptRoom(request: Omit<GenerateRequestInput, 'transcriptText' | 'partIndex' | 'partCount'>): number {
  return MAX_REQUEST_TEXT - JSON.stringify({ ...request, transcriptText: '', partIndex: 9999, partCount: 9999 }).length;
}

// The text's paragraphs, in order: blocks separated by blank lines, with
// line endings made `\n` and the spaces around each block dropped.
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*\n\s*/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

// A paragraph too long for one part, cut into pieces that fit. Each cut is
// at the last line break that fits, else the last sentence end, else the
// last space; only a run of `limit` characters with no space at all is cut
// mid-word. The character at a line-break or space cut is the one dropped.
function cutParagraph(paragraph: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (serializedLength(rest) > limit) {
    let end = 0;
    for (let size = 0; end < rest.length; end++) {
      size += serializedLength(rest[end]);
      if (size > limit) break;
    }
    const head = rest.slice(0, end);
    const lineBreak = head.lastIndexOf('\n');
    const sentenceEnd = Math.max(...['. ', '؟ ', '! ', '؛ '].map((mark) => head.lastIndexOf(mark)));
    const space = head.search(/\s\S*$/);
    let cut: number;
    let skip = 1;
    if (lineBreak > 0) cut = lineBreak;
    else if (sentenceEnd > 0) cut = sentenceEnd + 1;
    else if (space > 0) cut = space;
    else {
      cut = end;
      skip = 0;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut + skip).trim();
  }
  if (rest !== '') pieces.push(rest);
  return pieces;
}

// The text in parts, each at most `limit` characters once serialized
// (`serializedLength`), breaking only between paragraphs: each part holds
// as many whole paragraphs as fit, joined by a blank line. A single
// paragraph longer than `limit` is cut on its own (`cutParagraph`). No text
// is lost: the parts joined by a blank line are the text's paragraphs
// joined by a blank line, apart from those cuts.
export function splitTranscript(text: string, limit: number): string[] {
  if (limit < 1) throw new Error('The limit must leave room for some text');
  const parts: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const piece of paragraphs(text).flatMap((paragraph) => cutParagraph(paragraph, limit))) {
    const cost = serializedLength(piece);
    if (current.length > 0 && size + BREAK_COST + cost > limit) {
      parts.push(current.join(PARAGRAPH_BREAK));
      current = [];
      size = 0;
    }
    size += (current.length > 0 ? BREAK_COST : 0) + cost;
    current.push(piece);
  }
  if (current.length > 0) parts.push(current.join(PARAGRAPH_BREAK));
  return parts;
}

// Room kept in each part's request for the Subject's name, which is read
// when the part is sent, so splitting doesn't depend on it: renaming the
// Subject later splits a re-attached Transcript the same way.
const SUBJECT_NAME_ROOM = 500;

// A Lesson's Transcript text in the parts it is sent in (`splitTranscript`).
// The same text always splits into the same parts, on the phone and in the
// Channel Reader, so their digests match.
export function lessonTranscriptParts(
  lesson: { id: string; number: number; interactiveReviewUrl: string | null },
  transcriptText: string,
): string[] {
  const room = transcriptRoom({
    lessonId: lesson.id,
    subjectName: '',
    lessonNumber: lesson.number,
    interactiveReviewUrl: lesson.interactiveReviewUrl ?? undefined,
  });
  return splitTranscript(transcriptText, room - SUBJECT_NAME_ROOM);
}
