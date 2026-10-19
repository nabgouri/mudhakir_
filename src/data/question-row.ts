import type { QuestionContent } from './input';

// A Question as screens show it, read from its row in the `questions`
// table. Kept free of the database so the generation contract's tests can
// check that generated Questions show as intended.

export type Question = QuestionContent & {
  id: string;
  lessonId: string;
  subjectId: string;
  lessonNumber: number;
  sourcePassage: string | null;
};

export type QuestionRow = {
  id: string;
  lessonId: string;
  subjectId: string;
  lessonNumber: number;
  kind: 'multiple-choice' | 'open';
  prompt: string;
  options: string | null;
  correctOption: number | null;
  answer: string | null;
  sourcePassage: string | null;
};

export function questionFromRow(row: QuestionRow): Question {
  const base = {
    id: row.id,
    lessonId: row.lessonId,
    subjectId: row.subjectId,
    lessonNumber: row.lessonNumber,
    prompt: row.prompt,
    sourcePassage: row.sourcePassage,
  };
  return row.kind === 'multiple-choice'
    ? { ...base, kind: 'multiple-choice', options: JSON.parse(row.options ?? '[]'), correctOption: row.correctOption ?? 0 }
    : { ...base, kind: 'open', answer: row.answer ?? '' };
}
