// Reading the Ma'had Channel's posts as Lessons, for the Channel Reader
// (docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md).
//
// The channel posts each Lesson as an audio post whose caption holds its
// Lesson Title, a Transcript PDF named «<Subject> (n).pdf» and an Interactive
// Review link ending in the Lesson's number, posted together and each tagged
// with the Subject's hashtag (`#موجز_الاعتقاد`). Supplements
// (`#المواد_الإثرائية`), untagged PDFs and announcements are not Lessons.
//
// Plain TypeScript with no imports, so the Edge Function and the tests share
// it.

// One post as the reader sees it.
export type ChannelPost = {
  id: number;
  // Milliseconds since the epoch.
  date: number;
  text: string;
  mediaType: string | null;
  document: { fileName: string; mimeType: string } | null;
};

export type ChannelLesson = {
  subjectName: string;
  lessonNumber: number;
  title: string | null;
  pdfPostId: number | null;
  interactiveReviewUrl: string | null;
  postIds: number[];
  // When its first post was posted, in milliseconds since the epoch.
  date: number;
};

// Posts the reader could not read as Lessons, so a change in the channel's
// format is noticed rather than silently skipped.
export type ChannelProblem = { postIds: number[]; reason: string };

const SUPPLEMENT_TAG = 'المواد_الإثرائية';

// Posts of one Lesson are posted together; this much apart they are still
// one Lesson.
const SAME_LESSON_MS = 10 * 60 * 1000;

const HASHTAG = /#([\p{L}\p{M}\p{N}_]+)/gu;
// An address whose path ends in the Lesson's number: `…/Muojaz/13`.
const REVIEW_LINK = /https?:\/\/[^\s/]+\/\S*?\/(\d+)\/?(?=\s|$)/u;
// «موجز الاعتقاد (١٣).pdf». A range («(١-٣)») does not match.
const NUMBERED_PDF = /\(([0-9٠-٩۰-۹]+)\)\s*\.pdf$/iu;
// «🎙️ الدرس الثالث عشر : نماذج من الشرك …»
const AUDIO_TITLE = /الدرس[^:\n]*:\s*([^\n]+)/u;

// Western digits for Arabic-Indic (٠-٩) and Persian (۰-۹) ones.
function toNumber(digits: string): number {
  return Number(digits.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf)));
}

type Part =
  | { kind: 'link'; post: ChannelPost; number: number; url: string }
  | { kind: 'pdf'; post: ChannelPost; number: number }
  | { kind: 'audio'; post: ChannelPost; title: string }
  | { kind: 'other'; post: ChannelPost };

function partOf(post: ChannelPost): Part {
  if (post.document?.mimeType === 'application/pdf') {
    const match = NUMBERED_PDF.exec(post.document.fileName);
    if (match) return { kind: 'pdf', post, number: toNumber(match[1]) };
  }
  if (post.mediaType === 'audio') {
    const match = AUDIO_TITLE.exec(post.text);
    if (match) return { kind: 'audio', post, title: match[1].trim() };
  }
  const link = REVIEW_LINK.exec(post.text);
  if (link) return { kind: 'link', post, number: toNumber(link[1]), url: link[0].replace(/\/$/, '') };
  return { kind: 'other', post };
}

function lessonFrom(tag: string, parts: Part[]): ChannelLesson | ChannelProblem {
  const subjectName = tag.replace(/_/g, ' ');
  const postIds = parts.map((p) => p.post.id);
  const link = parts.find((p) => p.kind === 'link');
  const pdf = parts.find((p) => p.kind === 'pdf');
  const audio = parts.find((p) => p.kind === 'audio');
  if (link && pdf && link.number !== pdf.number) {
    return {
      postIds,
      reason: `The link says Lesson ${link.number} but the PDF says Lesson ${pdf.number} (${subjectName})`,
    };
  }
  const lessonNumber = link?.number ?? pdf?.number;
  if (lessonNumber === undefined) {
    return { postIds, reason: `A ${subjectName} Lesson with no PDF or link to tell its number` };
  }
  return {
    subjectName,
    lessonNumber,
    title: audio?.title ?? null,
    pdfPostId: pdf?.post.id ?? null,
    interactiveReviewUrl: link?.url ?? null,
    postIds,
    date: parts[0].post.date,
  };
}

// The Lessons in `posts`, oldest first, and the tagged posts that could not
// be read as Lessons.
export function lessonsFromPosts(posts: readonly ChannelPost[]): { lessons: ChannelLesson[]; problems: ChannelProblem[] } {
  const lessons: ChannelLesson[] = [];
  const problems: ChannelProblem[] = [];

  // Each Subject's Lesson posts, in posting order, in runs posted together.
  const groups: { tag: string; parts: Part[] }[] = [];
  const open = new Map<string, { tag: string; parts: Part[] }>();
  for (const post of [...posts].sort((a, b) => a.date - b.date || a.id - b.id)) {
    const tags = [...post.text.matchAll(HASHTAG)].map((m) => m[1]);
    if (tags.length === 0 || tags.includes(SUPPLEMENT_TAG)) continue;
    const part = partOf(post);
    const tag = tags[0];
    if (part.kind === 'other') {
      problems.push({ postIds: [post.id], reason: `A #${tag} post that is not a Lesson’s audio, PDF or link` });
      continue;
    }
    const group = open.get(tag);
    if (group && post.date - group.parts[0].post.date <= SAME_LESSON_MS) {
      group.parts.push(part);
    } else {
      const fresh = { tag, parts: [part] };
      groups.push(fresh);
      open.set(tag, fresh);
    }
  }

  for (const { tag, parts } of groups) {
    const result = lessonFrom(tag, parts);
    if ('reason' in result) problems.push(result);
    else lessons.push(result);
  }
  return { lessons, problems };
}

// Which past books to import: Lessons posted before `since` are imported
// only for `pastSubjects`; every Lesson posted since is imported, so a book
// the channel starts later comes in on its own.
export type ImportScope = { since: number; pastSubjects: readonly string[] };

export function lessonsToImport(lessons: readonly ChannelLesson[], scope: ImportScope): ChannelLesson[] {
  return lessons.filter((lesson) => lesson.date >= scope.since || scope.pastSubjects.includes(lesson.subjectName));
}
