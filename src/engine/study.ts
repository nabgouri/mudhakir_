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
  // When the Question was first reviewed.
  firstReview: number;
};

export type Priority = 'core' | 'detail';

export type StudyQuestion = {
  id: string;
  subjectId: string;
  // The Lesson's number in its Subject: the highest is the newest Lesson.
  lessonNumber: number;
  priority: Priority;
  // Orders a Lesson's new Questions: the earliest added is introduced first.
  createdAt: number;
  state: QuestionState | null;
};

export type Filter = { subjectId?: string };

export const DEFAULT_SESSION_SIZE = 6;
// The most new Questions one Review Session introduces, so a quiet day can't
// load the following weeks with more reviews than sessions can hold.
export const NEW_PER_SESSION = 3;

// Any step is shorter than the gap between two prayers, so a step means "at
// the next Reminder". A new Question keeps one step, for Again and Hard; Good
// and Easy skip it, rather than bring every new Question back at the next
// prayer (docs/adr/0003-new-questions-fill-only-free-review-places.md).
const scheduler = fsrs({ learning_steps: ['1m'] });

const FSRS_RATINGS: Record<Rating, Grade> = {
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
  const { card } = scheduler.next(toCard(state, now), now, FSRS_RATINGS[rating]);
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

export type PastReview = { rating: Rating; reviewedAt: number };

// A Question's state rebuilt from all its Reviews, in the order they were
// made: what the phone stores after its Reviews arrive from the backup.
export function replay(reviews: PastReview[]): QuestionState | null {
  return [...reviews]
    .sort((a, b) => a.reviewedAt - b.reviewedAt)
    .reduce<QuestionState | null>((state, review) => rate(state, review.rating, new Date(review.reviewedAt)), null);
}

// A Multiple-Choice answer is rated for the student.
export function ratingForChoice(correct: boolean): Rating {
  return correct ? 'good' : 'again';
}

// The same Questions, taking turns between Subjects: each Subject keeps its
// own order, and Subjects take turns in the order they first appear.
function alternateSubjects(questions: readonly StudyQuestion[]): StudyQuestion[] {
  const queues = new Map<string, StudyQuestion[]>();
  for (const q of questions) {
    const queue = queues.get(q.subjectId);
    if (queue) queue.push(q);
    else queues.set(q.subjectId, [q]);
  }
  const result: StudyQuestion[] = [];
  while (result.length < questions.length) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next) result.push(next);
    }
  }
  return result;
}

// The order new Questions are introduced in
// (docs/adr/0003-new-questions-fill-only-free-review-places.md): the Core
// Questions of each Subject's newest Lesson, then older Lessons' Core
// Questions, oldest Lesson first, then Detail Questions, oldest Lesson first.
// Within a Lesson they keep the order they were added in, and within each
// step the Subjects take turns. The newest Lesson is the newest of all the
// Subject's Questions, seen or not, so once its Core Questions are all
// introduced, older Lessons come next, oldest first.
function newOrder(fresh: readonly StudyQuestion[], all: readonly StudyQuestion[]): StudyQuestion[] {
  const newest = new Map<string, number>();
  for (const q of all) newest.set(q.subjectId, Math.max(newest.get(q.subjectId) ?? 0, q.lessonNumber));
  const step = (q: StudyQuestion) => (q.priority === 'detail' ? 2 : q.lessonNumber === newest.get(q.subjectId) ? 0 : 1);
  const sorted = [...fresh].sort((a, b) => a.lessonNumber - b.lessonNumber || a.createdAt - b.createdAt);
  return [0, 1, 2].flatMap((n) => alternateSubjects(sorted.filter((q) => step(q) === n)));
}

// The Questions a Review Session could ask at `now`, in the order to ask
// them: Questions already reviewed, most overdue first, then at most
// `NEW_PER_SESSION` new Questions, taking turns between Subjects.
export function due(questions: readonly StudyQuestion[], now: Date, filter: Filter = {}): StudyQuestion[] {
  const inFilter = questions.filter((q) => filter.subjectId === undefined || q.subjectId === filter.subjectId);
  const reviewed = inFilter
    .filter((q) => q.state !== null && q.state.due <= now.getTime())
    .sort((a, b) => a.state!.due - b.state!.due);
  const fresh = newOrder(inFilter.filter((q) => q.state === null), questions);
  return [...reviewed, ...fresh.slice(0, NEW_PER_SESSION)];
}

// The Questions for one Review Session. New Questions only fill the places
// the due reviews leave free, and the session takes turns between Subjects.
export function nextSession(
  questions: readonly StudyQuestion[],
  now: Date,
  size: number = DEFAULT_SESSION_SIZE,
  filter: Filter = {},
): StudyQuestion[] {
  return alternateSubjects(due(questions, now, filter).slice(0, size));
}

// How many Questions a Review Session for each Subject could ask now. The
// new-Question limit is per session, so the counts can add up to more than
// one session introduces.
export function dueCountsBySubject(questions: readonly StudyQuestion[], now: Date): Map<string, number> {
  const counts = new Map<string, number>();
  for (const subjectId of new Set(questions.map((q) => q.subjectId))) {
    counts.set(subjectId, due(questions, now, { subjectId }).length);
  }
  return counts;
}
