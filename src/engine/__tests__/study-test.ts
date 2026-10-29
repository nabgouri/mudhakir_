import {
  DEFAULT_SESSION_SIZE,
  NEW_PER_SESSION,
  due,
  dueCountsBySubject,
  nextSession,
  rate,
  ratingForChoice,
  replay,
  type QuestionState,
  type Rating,
  type StudyQuestion,
} from '../study';

// A fixed clock on one day. Prayer times are those of a typical day; the
// engine only sees the times.
const DAY = { year: 2026, month: 9, date: 19 };
const at = (hours: number, minutes = 0, dayOffset = 0) =>
  new Date(DAY.year, DAY.month, DAY.date + dayOffset, hours, minutes);
const DHUHR = at(12, 30);
const ASR = at(15, 45);
const HOUR = 60 * 60 * 1000;

function question(id: string, overrides: Partial<StudyQuestion> = {}): StudyQuestion {
  return { id, subjectId: 'fiqh', lessonNumber: 1, priority: 'core', studied: true, createdAt: 0, state: null, ...overrides };
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

// A Question reviewed before and due again at `dueAt`.
const reviewedState = (dueAt: Date, firstReview = at(8, 0, -10)): QuestionState => ({
  ...rate(null, 'good', firstReview),
  due: dueAt.getTime(),
});

describe('due', () => {

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

  test('new Questions of one Lesson are introduced in the order they were added', () => {
    const questions = [question('third', { createdAt: 3 }), question('first', { createdAt: 1 }), question('second', { createdAt: 2 })];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['first', 'second', 'third']);
  });

  test('at most three new Questions are offered at a time', () => {
    const fresh = Array.from({ length: 20 }, (_, i) => question(`new-${i}`, { createdAt: i }));
    expect(due(fresh, ASR)).toHaveLength(NEW_PER_SESSION);
  });

  test('the limit does not hold back Questions that are already being reviewed', () => {
    const overdue = Array.from({ length: 12 }, (_, i) => question(`overdue-${i}`, { state: reviewedState(at(9), at(7)) }));
    expect(due(overdue, ASR)).toHaveLength(12);
  });

  test('the newest Lesson’s Core Questions come first, then older Lessons’ Core ones, oldest first, then Detail ones', () => {
    const questions = [
      question('l1-detail', { lessonNumber: 1, priority: 'detail', createdAt: 1 }),
      question('l3-detail', { lessonNumber: 3, priority: 'detail', createdAt: 2 }),
      question('l2-core', { lessonNumber: 2, createdAt: 3 }),
      question('l1-core', { lessonNumber: 1, createdAt: 4 }),
      question('l3-core', { lessonNumber: 3, createdAt: 5 }),
    ];
    const newOrder = (qs: StudyQuestion[]) => due(qs, ASR).map((q) => q.id);
    expect(newOrder(questions)).toEqual(['l3-core', 'l1-core', 'l2-core']);
    const coreSeen = questions.map((q) => (q.priority === 'core' ? { ...q, state: reviewedState(at(9, 0, 1)) } : q));
    expect(newOrder(coreSeen)).toEqual(['l1-detail', 'l3-detail']);
  });

  test('once the newest Lesson’s Core Questions are introduced, the oldest Lesson’s come next', () => {
    const questions = [
      question('l3-core', { lessonNumber: 3, state: reviewedState(at(9, 0, 1)) }),
      question('l2-core', { lessonNumber: 2, createdAt: 1 }),
      question('l1-core', { lessonNumber: 1, createdAt: 2 }),
    ];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['l1-core', 'l2-core']);
  });

  test('new Questions of a Lesson not yet studied are not introduced', () => {
    const questions = [
      question('studied', { lessonNumber: 13, createdAt: 1 }),
      question('not-studied', { lessonNumber: 14, studied: false, createdAt: 2 }),
    ];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['studied']);
  });

  test('a reviewed Question still comes back if its Lesson is marked not studied', () => {
    const questions = [question('seen', { studied: false, state: reviewedState(at(9)) })];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['seen']);
  });

  test('the newest studied Lesson counts as newest, not a newer one not yet studied', () => {
    const questions = [
      question('l12-core', { lessonNumber: 12, createdAt: 1 }),
      question('l13-core', { lessonNumber: 13, createdAt: 2 }),
      question('l14-core', { lessonNumber: 14, studied: false, createdAt: 3 }),
    ];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['l13-core', 'l12-core']);
  });

  test('each Subject’s newest Lesson counts as newest, and the Subjects take turns', () => {
    const questions = [
      question('aqeedah-12-a', { subjectId: 'aqeedah', lessonNumber: 12, createdAt: 1 }),
      question('aqeedah-12-b', { subjectId: 'aqeedah', lessonNumber: 12, createdAt: 2 }),
      question('quloub-14-a', { subjectId: 'quloub', lessonNumber: 14, createdAt: 3 }),
      question('aqeedah-11', { subjectId: 'aqeedah', lessonNumber: 11, createdAt: 0 }),
    ];
    expect(due(questions, ASR).map((q) => q.id)).toEqual(['aqeedah-12-a', 'quloub-14-a', 'aqeedah-12-b']);
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
  const reviewed = (subjectId: string, count: number, dueAt = at(9)) =>
    Array.from({ length: count }, (_, i) =>
      question(`${subjectId}-due-${i}`, { subjectId, state: reviewedState(new Date(dueAt.getTime() + i * 60_000)) }),
    );
  const fresh = (subjectId: string, count: number) =>
    Array.from({ length: count }, (_, i) => question(`${subjectId}-new-${i}`, { subjectId, createdAt: i }));

  test('a session asks six Questions', () => {
    expect(DEFAULT_SESSION_SIZE).toBe(6);
    expect(nextSession(reviewed('fiqh', 12), ASR)).toHaveLength(6);
  });

  test.each([
    [12, 6, 6],
    [3, 6, 3],
    [0, 6, 0],
    [12, 8, 8],
  ])('with %i due Questions and a session size of %i, the session has %i', (available, size, expected) => {
    expect(nextSession(reviewed('fiqh', available), ASR, size)).toHaveLength(expected);
  });

  test.each([
    // [due reviews, new Questions waiting, expected new Questions asked]
    [4, 10, 2],
    [6, 10, 0],
    [0, 10, 3],
    [1, 1, 1],
  ])('with %i due reviews and %i new Questions, a session of six asks %i new ones', (reviews, waiting, expected) => {
    const session = nextSession([...reviewed('fiqh', reviews), ...fresh('fiqh', waiting)], ASR, 6);
    expect(session.filter((q) => q.state === null)).toHaveLength(expected);
  });

  test('a session alternates between Subjects, starting with the most urgent Question', () => {
    const questions = [...reviewed('fiqh', 3, at(10)), ...reviewed('aqeedah', 3, at(9))];
    expect(nextSession(questions, ASR, 6).map((q) => q.subjectId)).toEqual([
      'aqeedah',
      'fiqh',
      'aqeedah',
      'fiqh',
      'aqeedah',
      'fiqh',
    ]);
  });

  test('a session filtered to one Subject asks only that Subject’s Questions', () => {
    const questions = [...reviewed('fiqh', 6), ...reviewed('aqeedah', 6)];
    const session = nextSession(questions, ASR, 5, { subjectId: 'aqeedah' });
    expect(session).toHaveLength(5);
    expect(session.every((q) => q.subjectId === 'aqeedah')).toBe(true);
  });

  test('a session takes the most urgent due Questions first', () => {
    const overdue = question('overdue', { state: { ...rate(null, 'good', at(7, 0, -3)), due: at(9).getTime() } });
    const session = nextSession([...reviewed('fiqh', 6, at(12)), overdue], ASR, 5);
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
