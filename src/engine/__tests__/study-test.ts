import { due, dueCountsBySubject, nextSession, rate, ratingForChoice, replay, type QuestionState, type Rating, type StudyQuestion } from '../study';

// A fixed clock on one day. Prayer times are those of a typical day; the
// engine only sees the times.
const DAY = { year: 2026, month: 9, date: 19 };
const at = (hours: number, minutes = 0, dayOffset = 0) =>
  new Date(DAY.year, DAY.month, DAY.date + dayOffset, hours, minutes);
const DHUHR = at(12, 30);
const ASR = at(15, 45);
const HOUR = 60 * 60 * 1000;

function question(id: string, overrides: Partial<StudyQuestion> = {}): StudyQuestion {
  return { id, subjectId: 'fiqh', createdAt: 0, state: null, ...overrides };
}

// The state after a series of Reviews, each made as soon as the previous
// one made the Question due.
function reviewSeries(ratings: Rating[], start: Date): QuestionState[] {
  const states: QuestionState[] = [];
  let state: QuestionState | null = null;
  let now = start;
  for (const rating of ratings) {
    state = rate(state, rating, now);
    states.push(state);
    now = new Date(state.due);
  }
  return states;
}

describe('rate', () => {
  test('a new Question rated Again after Dhuhr is due again by Asr, the same day', () => {
    const state = rate(null, 'again', DHUHR);
    expect(state.due).toBeGreaterThan(DHUHR.getTime());
    expect(state.due).toBeLessThanOrEqual(ASR.getTime());
  });

  test('a new Question rated Hard after Dhuhr is due again by Asr, the same day', () => {
    const state = rate(null, 'hard', DHUHR);
    expect(state.due).toBeLessThanOrEqual(ASR.getTime());
  });

  test.each<Rating>(['good', 'easy'])('a new Question rated %s is not asked again the same day', (rating) => {
    const state = rate(null, rating, DHUHR);
    expect(state.due).toBeGreaterThanOrEqual(at(0, 0, 1).getTime());
    expect(state.phase).toBe('review');
  });

  test('a well-known Question rated Again comes back within hours, the same day', () => {
    const known = reviewSeries(['good', 'good', 'good', 'good'], at(6)).at(-1)!;
    const reviewedAt = new Date(known.due);
    const lapsed = rate(known, 'again', reviewedAt);
    expect(lapsed.due - reviewedAt.getTime()).toBeLessThanOrEqual(3 * HOUR);
    expect(new Date(lapsed.due).getDate()).toBe(reviewedAt.getDate());
  });

  test('repeated Good ratings make the gaps between Reviews grow', () => {
    const states = reviewSeries(['good', 'good', 'good', 'good', 'good', 'good'], at(6));
    const gaps = states.map((state) => state.due - state.lastReview);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  test.each<[Rating, Rating]>([
    ['again', 'hard'],
    ['hard', 'good'],
    ['good', 'easy'],
  ])('on a known Question, %s brings it back sooner than %s', (sooner, later) => {
    const known = reviewSeries(['good', 'good', 'good'], at(6)).at(-1)!;
    const now = new Date(known.due);
    expect(rate(known, sooner, now).due).toBeLessThan(rate(known, later, now).due);
  });

  test('the first Review is remembered as the day the Question was introduced', () => {
    const states = reviewSeries(['good', 'again', 'good'], DHUHR);
    for (const state of states) expect(state.firstReview).toBe(DHUHR.getTime());
  });
});

test.each([
  [false, 'again'],
  [true, 'good'],
])('a multiple-choice answer that is right=%s counts as %s', (correct, rating) => {
  expect(ratingForChoice(correct)).toBe(rating);
});

describe('replay', () => {
  test('a Question with no Reviews is new', () => {
    expect(replay([])).toBeNull();
  });

  test('replaying the Reviews from a backup, in any order, gives the schedule the phone had', () => {
    const ratings: Rating[] = ['again', 'good', 'hard', 'good', 'easy'];
    const states = reviewSeries(ratings, at(6));
    const reviews = ratings.map((rating, i) => ({ rating, reviewedAt: i === 0 ? at(6).getTime() : states[i - 1].due }));
    expect(replay([...reviews].reverse())).toEqual(states.at(-1));
  });
});

describe('due', () => {
  const reviewedState = (dueAt: Date, firstReview = at(8, 0, -10)): QuestionState => ({
    ...rate(null, 'good', firstReview),
    due: dueAt.getTime(),
  });

  test('Questions not yet due are left out', () => {
    const questions = [question('later', { state: reviewedState(at(18)) })];
    expect(due(questions, ASR)).toEqual([]);
  });

  test('overdue Questions come before new ones, most overdue first', () => {
    const questions = [
      question('new-a', { createdAt: 1 }),
      question('overdue-1h', { state: reviewedState(at(14, 45)) }),
      question('new-b', { createdAt: 2 }),
      question('overdue-1d', { state: reviewedState(at(15, 45, -1)) }),
    ];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['overdue-1d', 'overdue-1h', 'new-a', 'new-b']);
  });

  test('new Questions are introduced in the order they were added', () => {
    const questions = [question('third', { createdAt: 3 }), question('first', { createdAt: 1 }), question('second', { createdAt: 2 })];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['first', 'second', 'third']);
  });

  test.each([
    // [new Questions waiting, already introduced today, limit, expected new Questions offered]
    [20, 0, 10, 10],
    [20, 4, 10, 6],
    [20, 10, 10, 0],
    [20, 12, 10, 0],
    [3, 0, 10, 3],
  ])('with %i new Questions, %i introduced today and a limit of %i, %i new ones are due', (waiting, introduced, limit, expected) => {
    const fresh = Array.from({ length: waiting }, (_, i) => question(`new-${i}`, { createdAt: i }));
    // Introduced earlier today and not due again until tomorrow.
    const today = Array.from({ length: introduced }, (_, i) =>
      question(`today-${i}`, { state: reviewedState(at(9, 0, 1), at(7)) }),
    );
    const result = due([...fresh, ...today], ASR, {}, { newPerDay: limit });
    expect(result.filter((q) => q.state === null)).toHaveLength(expected);
  });

  test('Questions introduced yesterday do not count against today’s limit', () => {
    const fresh = Array.from({ length: 5 }, (_, i) => question(`new-${i}`, { createdAt: i }));
    const yesterday = Array.from({ length: 5 }, (_, i) =>
      question(`old-${i}`, { state: reviewedState(at(9, 0, 1), at(20, 0, -1)) }),
    );
    expect(due([...fresh, ...yesterday], ASR, {}, { newPerDay: 5 })).toHaveLength(5);
  });

  test('the limit does not hold back Questions that are already being reviewed', () => {
    const overdue = Array.from({ length: 12 }, (_, i) => question(`overdue-${i}`, { state: reviewedState(at(9), at(7)) }));
    expect(due(overdue, ASR, {}, { newPerDay: 10 })).toHaveLength(12);
  });

  test('the daily limit counts new Questions introduced in every Subject, also when filtered', () => {
    const fiqhToday = Array.from({ length: 10 }, (_, i) =>
      question(`fiqh-${i}`, { subjectId: 'fiqh', state: reviewedState(at(9, 0, 1), at(7)) }),
    );
    const aqeedahNew = Array.from({ length: 5 }, (_, i) => question(`aqeedah-${i}`, { subjectId: 'aqeedah', createdAt: i }));
    expect(due([...fiqhToday, ...aqeedahNew], ASR, { subjectId: 'aqeedah' }, { newPerDay: 10 })).toEqual([]);
  });

  test('a Subject filter keeps only that Subject’s Questions', () => {
    const questions = [
      question('fiqh-new', { subjectId: 'fiqh' }),
      question('aqeedah-new', { subjectId: 'aqeedah' }),
      question('aqeedah-due', { subjectId: 'aqeedah', state: reviewedState(at(9)) }),
    ];
    expect(due(questions, ASR, { subjectId: 'aqeedah' }).map((q) => q.id)).toEqual(['aqeedah-due', 'aqeedah-new']);
  });
});

describe('nextSession', () => {
  const many = (subjectId: string, count: number) =>
    Array.from({ length: count }, (_, i) => question(`${subjectId}-${i}`, { subjectId, createdAt: i }));

  test.each([
    [12, 5, 5],
    [3, 5, 3],
    [0, 5, 0],
    [12, 8, 8],
  ])('with %i due Questions and a session size of %i, the session has %i', (available, size, expected) => {
    expect(nextSession(many('fiqh', available), ASR, size)).toHaveLength(expected);
  });

  test('a session filtered to one Subject asks only that Subject’s Questions', () => {
    const questions = [...many('fiqh', 6), ...many('aqeedah', 6)];
    const session = nextSession(questions, ASR, 5, { subjectId: 'aqeedah' });
    expect(session).toHaveLength(5);
    expect(session.every((q) => q.subjectId === 'aqeedah')).toBe(true);
  });

  test('a session takes the most urgent due Questions first', () => {
    const overdue = question('overdue', { state: { ...rate(null, 'good', at(7, 0, -3)), due: at(9).getTime() } });
    const session = nextSession([...many('fiqh', 6), overdue], ASR, 5);
    expect(session[0].id).toBe('overdue');
  });

  test('a Question rated Again in one session is in the next one, at Asr', () => {
    const [first] = nextSession([question('q')], DHUHR, 5);
    const after = { ...first, state: rate(first.state, 'again', DHUHR) };
    expect(nextSession([after], ASR, 5).map((q) => q.id)).toEqual(['q']);
  });
});

test('each Subject’s due count is what a Review Session for that Subject could ask', () => {
  const questions = [
    question('fiqh-1', { subjectId: 'fiqh' }),
    question('fiqh-2', { subjectId: 'fiqh' }),
    question('aqeedah-later', { subjectId: 'aqeedah', state: { ...rate(null, 'good', at(7)), due: at(9, 0, 1).getTime() } }),
  ];
  expect(Object.fromEntries(dueCountsBySubject(questions, ASR))).toEqual({ fiqh: 2, aqeedah: 0 });
});
