import { parseInteractiveReviewUrl, parseLessonNumber, parseSubjectName } from '../input';

describe('parseSubjectName', () => {
  test.each([
    ['الفقه', 'الفقه'],
    ['  العقيدة  ', 'العقيدة'],
    ['أصول   الفقه', 'أصول الفقه'],
    ['الفِقْهُ المُيَسَّر', 'الفِقْهُ المُيَسَّر'],
    ['', null],
    ['   ', null],
    ['\u200F', null],
    ['\u200C \u200B', null],
    ['\u200Fالسيرة', 'السيرة'],
  ])('%j → %j', (raw, expected) => {
    expect(parseSubjectName(raw)).toBe(expected);
  });
});

test('the same name typed with its diacritics in a different order is one name', () => {
  const shaddaThenKasra = 'فق\u0651\u0650ه';
  const kasraThenShadda = 'فق\u0650\u0651ه';
  expect(parseSubjectName(shaddaThenKasra)).toBe(parseSubjectName(kasraThenShadda));
});

describe('parseLessonNumber', () => {
  test.each([
    ['1', 1],
    [' 12 ', 12],
    ['٣', 3],
    ['١٥', 15],
    ['۷', 7],
    ['0', null],
    ['-2', null],
    ['2.5', null],
    ['ثلاثة', null],
    ['', null],
    ['9999', 9999],
    ['10000', null],
  ])('%j → %j', (raw, expected) => {
    expect(parseLessonNumber(raw)).toBe(expected);
  });
});

describe('parseInteractiveReviewUrl', () => {
  test.each([
    ['https://review.example.org/fiqh/3', 'https://review.example.org/fiqh/3'],
    ['  https://review.example.org/fiqh/3\n', 'https://review.example.org/fiqh/3'],
    ['\u200Fhttps://review.example.org/?lesson=3', 'https://review.example.org/?lesson=3'],
    ['review.example.org/fiqh/3', 'https://review.example.org/fiqh/3'],
    ['http://review.example.org', 'http://review.example.org'],
    ['', undefined],
    ['   ', undefined],
    ['المذاكرة', null],
    ['ftp://review.example.org/3', null],
    ['https://review example.org', null],
  ])('%j → %j', (raw, expected) => {
    expect(parseInteractiveReviewUrl(raw)).toBe(expected);
  });
});
