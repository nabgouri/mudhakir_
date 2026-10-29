import { lessonsFromPosts, type ChannelPost } from '../channel';

// Reading the Ma'had Channel's posts as Lessons. The posts are shaped as the
// channel really posts them: each Lesson is an audio post with its title, a
// Transcript PDF and an Interactive Review link, posted together and tagged
// with the Subject's hashtag.

const AT = Date.UTC(2026, 9, 26, 3, 0, 31);

let nextId = 1;
function post(fields: Partial<ChannelPost>): ChannelPost {
  return { id: nextId++, date: AT, text: '', mediaType: null, document: null, ...fields };
}

function pdf(fileName: string, text: string, date = AT): ChannelPost {
  return post({ date, text, mediaType: 'document', document: { fileName, mimeType: 'application/pdf' } });
}

function lesson13(date = AT): ChannelPost[] {
  return [
    post({ date, text: '📘 المقرر الأساسي:\n\nموجز الاعتقاد (١٣)' }),
    post({ date, mediaType: 'audio', text: '🎙️ الدرس الثالث عشر : نماذج من الشرك الأكبر في توحيد الألوهية \n\n#موجز_الاعتقاد' }),
    pdf('موجز الاعتقاد (١٣).pdf', '📄 تفريغ الدرس الثالث عشر \n\n#موجز_الاعتقاد', date),
    post({
      date,
      text: 'https://lessons.aqadi-it-students.workers.dev/Muojaz/13\n\nدليل المذاكرة التفاعلي | الدرس الثالث عشر\n\n#موجز_الاعتقاد',
    }),
  ];
}

beforeEach(() => {
  nextId = 1;
});

test('a Lesson’s audio, PDF and link become one Lesson with its Subject, number, title and material', () => {
  const posts = lesson13();
  const { lessons, problems } = lessonsFromPosts(posts);
  expect(problems).toEqual([]);
  expect(lessons).toEqual([
    {
      subjectName: 'موجز الاعتقاد',
      lessonNumber: 13,
      title: 'نماذج من الشرك الأكبر في توحيد الألوهية',
      pdfPostId: posts[2].id,
      interactiveReviewUrl: 'https://lessons.aqadi-it-students.workers.dev/Muojaz/13',
      postIds: [posts[1].id, posts[2].id, posts[3].id],
    },
  ]);
});

test('two Subjects posted at the same moment are two Lessons', () => {
  const posts = [
    ...lesson13(),
    post({ mediaType: 'audio', text: '🎙️ الدرس الرابع عشر : الرياء، والعُجب، والغُرور\n\n#أعمال_القلوب' }),
    pdf('أعمال القلوب (١٤).pdf', '📄 تفريغ الدرس الرابع عشر \n\n#أعمال_القلوب'),
    post({ text: 'https://lessons.aqadi-it-students.workers.dev/Quloub/14\n\n📝 دليل المذاكرة التفاعلي | الدرس الرابع عشر\n\n#أعمال_القلوب' }),
  ];
  const { lessons } = lessonsFromPosts(posts);
  expect(lessons.map((l) => [l.subjectName, l.lessonNumber, l.title])).toEqual([
    ['موجز الاعتقاد', 13, 'نماذج من الشرك الأكبر في توحيد الألوهية'],
    ['أعمال القلوب', 14, 'الرياء، والعُجب، والغُرور'],
  ]);
});

test('Lessons come oldest first, whatever order the posts are in', () => {
  const earlier = lesson13(AT - 4 * 24 * 60 * 60 * 1000).map((p) => ({
    ...p,
    text: p.text.replace(/١٣/g, '١٢').replace('/13', '/12'),
    document: p.document && { ...p.document, fileName: p.document.fileName.replace('١٣', '١٢') },
  }));
  const { lessons } = lessonsFromPosts([...lesson13(), ...earlier].reverse());
  expect(lessons.map((l) => l.lessonNumber)).toEqual([12, 13]);
});

test('a Lesson with only a PDF, or only a link, is still a Lesson', () => {
  const onlyPdf = lessonsFromPosts([pdf('موجز الاعتقاد (١٣).pdf', '📄 تفريغ الدرس الثالث عشر \n\n#موجز_الاعتقاد')]);
  expect(onlyPdf.lessons).toMatchObject([{ lessonNumber: 13, interactiveReviewUrl: null, title: null }]);
  const onlyLink = lessonsFromPosts([post({ text: 'https://lessons.aqadi-it-students.workers.dev/Muojaz/13\n\n#موجز_الاعتقاد' })]);
  expect(onlyLink.lessons).toMatchObject([{ lessonNumber: 13, pdfPostId: null }]);
});

test('Supplements, untagged PDFs and announcements are not Lessons', () => {
  const { lessons, problems } = lessonsFromPosts([
    pdf('التحلي بالعمل.pdf', '📄 التحلي بالعمل\n[من حلية طالب العلم للشيخ بكر أبو زيد] \n\n#المواد_الإثرائية'),
    pdf('متن الموجز - الأسابيع (١-٣).pdf', ''),
    pdf('مقرر أعمال القلوب (١-١٢).pdf', ''),
    post({ mediaType: 'audio', text: '🎧 تسجيل اللقاء المباشر السابع مع فضيلة الشيخ' }),
    post({ mediaType: 'webpage', text: '📝 الاختبار النصفي لأعمال القلوب\n\nhttps://forms.gle/xwQfVmoohsG34hpx5' }),
    post({ mediaType: 'sticker' }),
  ]);
  expect(lessons).toEqual([]);
  expect(problems).toEqual([]);
});

test('a Lesson whose link and PDF give different numbers is left out, as a problem', () => {
  const posts = [
    pdf('موجز الاعتقاد (١٣).pdf', '📄 تفريغ الدرس الثالث عشر \n\n#موجز_الاعتقاد'),
    post({ text: 'https://lessons.aqadi-it-students.workers.dev/Muojaz/14\n\n#موجز_الاعتقاد' }),
  ];
  const { lessons, problems } = lessonsFromPosts(posts);
  expect(lessons).toEqual([]);
  expect(problems).toEqual([
    { postIds: [posts[0].id, posts[1].id], reason: 'The link says Lesson 14 but the PDF says Lesson 13 (موجز الاعتقاد)' },
  ]);
});

test('a tagged post that is not a Lesson’s audio, PDF or link is a problem, so the format change is noticed', () => {
  const odd = post({ text: 'ملخص الدرس الثالث عشر\n\n#موجز_الاعتقاد' });
  const { lessons, problems } = lessonsFromPosts([...lesson13(), odd]);
  expect(lessons).toHaveLength(1);
  expect(problems).toEqual([{ postIds: [odd.id], reason: 'A #موجز_الاعتقاد post that is not a Lesson’s audio, PDF or link' }]);
});

test('an audio post with no PDF or link gives no Lesson, as a problem', () => {
  const audio = post({ mediaType: 'audio', text: '🎙️ الدرس الثالث عشر : نماذج من الشرك\n\n#موجز_الاعتقاد' });
  const { lessons, problems } = lessonsFromPosts([audio]);
  expect(lessons).toEqual([]);
  expect(problems).toEqual([{ postIds: [audio.id], reason: 'A موجز الاعتقاد Lesson with no PDF or link to tell its number' }]);
});
