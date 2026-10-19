// The study engine: when each Question comes back, and which Questions a
// Review Session asks. Pure functions with no I/O; the caller passes the clock.
// Scheduling is FSRS, through ts-fsrs.
import { fsrs, Rating as FsrsRating, State, type Card, type Grade } from 'ts-fsrs';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

// A Question's schedule after at least one Review; a new Question has none.
// Times are milliseconds since the epoch, so the state stores as JSON.
export type QuestionState = {
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  phase: 'learning' | 'review' | 'relearning';
  lastReview: number;
  // When the Question was first reviewed: the day it counts against the
  // daily new-Question limit.
  firstReview: number;
};

export type StudyQuestion = {
  id: string;
  subjectId: string;
  // Orders new Questions: the earliest added is introduced first.
  createdAt: number;
  state: QuestionState | null;
};

export type Filter = { subjectId?: string };

export const DEFAULT_NEW_PER_DAY = 10;
export const DEFAULT_SESSION_SIZE = 5;

// The default (re)learning steps (1m, 10m) are shorter than the gap between
// two prayers, so a Question rated Again is due at the next Reminder.
const scheduler = fsrs();

const GRADES: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const PHASES = {
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
} as const;

const STATES = {
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
} as const;

function toCard(state: QuestionState | null, now: Date): Card {
  if (state === null) {
    return {
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
    };
  }
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: STATES[state.phase],
    last_review: new Date(state.lastReview),
  };
}

// The Question's new state after a Review with this Rating at `now`.
export function rate(state: QuestionState | null, rating: Rating, now: Date): QuestionState {
  const { card } = scheduler.next(toCard(state, now), now, GRADES[rating]);
  if (card.state === State.New) throw new Error('A reviewed Question cannot be new');
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    phase: PHASES[card.state],
    lastReview: now.getTime(),
    firstReview: state?.firstReview ?? now.getTime(),
  };
}

// A multiple-choice answer is graded for the student.
export function ratingForChoice(correct: boolean): Rating {
  return correct ? 'good' : 'again';
}

function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// The Questions due at `now`, in the order to ask them: Questions already
// reviewed, most overdue first, then new Questions, earliest added first.
// New Questions are capped so that at most `newPerDay` are first reviewed on
// one calendar day (the phone's local day), counted across all Subjects.
export function due(
  questions: readonly StudyQuestion[],
  now: Date,
  filter: Filter = {},
  { newPerDay = DEFAULT_NEW_PER_DAY }: { newPerDay?: number } = {},
): StudyQuestion[] {
  const today = startOfDay(now);
  const introducedToday = questions.filter((q) => q.state !== null && q.state.firstReview >= today).length;
  const inFilter = questions.filter((q) => filter.subjectId === undefined || q.subjectId === filter.subjectId);

  const reviewed = inFilter
    .filter((q) => q.state !== null && q.state.due <= now.getTime())
    .sort((a, b) => a.state!.due - b.state!.due);
  const fresh = inFilter
    .filter((q) => q.state === null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, newPerDay - introducedToday));

  return [...reviewed, ...fresh];
}

// The Questions for one Review Session.
export function nextSession(
  questions: readonly StudyQuestion[],
  now: Date,
  size: number = DEFAULT_SESSION_SIZE,
  filter: Filter = {},
  limits: { newPerDay?: number } = {},
): StudyQuestion[] {
  return due(questions, now, filter, limits).slice(0, size);
}

// How many Questions a Review Session for each Subject could ask now.
export function dueCountsBySubject(
  questions: readonly StudyQuestion[],
  now: Date,
  limits: { newPerDay?: number } = {},
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const subjectId of new Set(questions.map((q) => q.subjectId))) {
    counts.set(subjectId, due(questions, now, { subjectId }, limits).length);
  }
  return counts;
}
