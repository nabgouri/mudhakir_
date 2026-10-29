import { EXTRACTOR_PAGE } from '../../src/transcript/extractor-page';
import { documentText, pageText, type TextItem } from '../pdf-text';

// The Channel Reader reads Transcript PDFs on the server with
// shared/pdf-text.ts; the phone reads them in a WebView page that is a
// string. Both must give the same text, or the same Lesson's Questions would
// depend on who read its PDF.

// The phone's `pageText`, taken from the page's script.
const phonePageText: (items: unknown[]) => string = (() => {
  const script = /<script>([\s\S]*)<\/script>/.exec(EXTRACTOR_PAGE)![1];
  const window = { ReactNativeWebView: { postMessage: () => {} } };
  return new Function('window', `${script}\nreturn pageText;`)(window);
})();

// A run of text at (x, y), as pdf.js gives it.
function run(str: string, x: number, y: number, fields: Partial<TextItem> = {}): TextItem {
  return { str, dir: 'rtl', transform: [10, 0, 0, 10, x, y], height: 10, ...fields };
}

const PAGES: Record<string, TextItem[]> = {
  'an Arabic line drawn left to right': [run('الطهارة', 100, 700), run(' ', 160, 700), run('لغةً:', 200, 700, { hasEOL: true })],
  'lines and a paragraph gap': [
    run('الطهارة لغةً: النظافة.', 300, 700, { hasEOL: true }),
    run('وشرعًا: ارتفاع الحدث.', 300, 686, { hasEOL: true }),
    run('والمياه ثلاثة:', 300, 672, { hasEOL: true }),
    run('طهور، وطاهر، ونجس.', 300, 640, { hasEOL: true }),
  ],
  'a run on a new line without an end-of-line mark': [run('السطر الأول', 300, 700), run('السطر الثاني', 300, 680)],
  'blank items and marked-content markers': [
    run('قبل', 300, 700, { hasEOL: true }),
    run('', 0, 0, { hasEOL: true }),
    { type: 'beginMarkedContent' } as unknown as TextItem,
    run('بعد', 300, 690, { hasEOL: true }),
  ],
  'unmapped glyphs and runs of spaces': [run('حكم\u0003   الماء�', 300, 700, { hasEOL: true })],
  'a left-to-right line': [
    run('Page', 50, 30, { dir: 'ltr' }),
    run(' ', 80, 30, { dir: 'ltr' }),
    run('12', 90, 30, { dir: 'ltr', hasEOL: true }),
  ],
};

test.each(Object.entries(PAGES))('the server reads %s as the phone does', (_, items) => {
  expect(pageText(items)).toBe(phonePageText(items));
});

test('an Arabic line drawn left to right reads right to left', () => {
  expect(pageText(PAGES['an Arabic line drawn left to right'])).toBe('لغةً: الطهارة');
});

test('a gap clearly wider than a line is a paragraph break', () => {
  expect(pageText(PAGES['lines and a paragraph gap'])).toBe(
    'الطهارة لغةً: النظافة.\nوشرعًا: ارتفاع الحدث.\nوالمياه ثلاثة:\n\nطهور، وطاهر، ونجس.',
  );
});

test('pages are joined by a blank line, skipping empty ones', () => {
  expect(documentText(['أ', '', 'ب'])).toBe('أ\n\nب');
});
