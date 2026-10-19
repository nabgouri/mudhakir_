import { parseLessonNumber, parseSubjectName } from '../input';

describe('parseSubjectName', () => {
  test.each([
    ['الفقه', 'الفقه'],
    ['  العقيدة  ', 'العقيدة'],
    ['أصول   الفقه', 'أصول الفقه'],
    ['الفِقْهُ المُيَسَّر', 'الفِقْهُ المُيَسَّر'],
    ['', null],
    ['   ', null],
  ])('%j → %j', (raw, expected) => {
    expect(parseSubjectName(raw)).toBe(expected);
  });
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
    ['10000', null],
  ])('%j → %j', (raw, expected) => {
    expect(parseLessonNumber(raw)).toBe(expected);
  });
});
