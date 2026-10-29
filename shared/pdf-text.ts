// A Transcript PDF's text from pdf.js text items, for the Channel Reader,
// which reads PDFs on the server. It is the same reading the phone does in
// its hidden WebView (src/transcript/extractor-page.ts), which is a string
// and can't import this; shared/__tests__/pdf-text-test.ts checks the two
// give the same text.
//
// Text comes out page by page: a line break after each printed line, and a
// blank line (a paragraph break, which the splitter uses) where the gap to
// the next line is clearly wider than a line, and between pages.

// The fields of a pdf.js `TextItem` that are read.
export type TextItem = {
  str: string;
  dir: string;
  transform: number[];
  height?: number;
  hasEOL?: boolean;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Glyphs the PDF gives no Unicode for come out as control characters.
const UNMAPPED = /[\u0000-\u0008\u000B-\u001F�]/g;

// pdf.js gives each run of text in reading order, but the runs of a line in
// the order they were drawn, which for Arabic is often left to right. So
// each line's runs are put in order by position: right to left when most of
// the line is right-to-left text.
function lineText(runs: TextItem[]): string {
  let rtl = 0;
  let ltr = 0;
  for (const run of runs) {
    const letters = run.str.replace(/[\s\d\p{P}]/gu, '').length;
    if (run.dir === 'rtl') rtl += letters;
    else ltr += letters;
  }
  const sorted = runs.slice().sort((a, b) => (rtl > ltr ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]));
  return sorted
    .map((run) => run.str)
    .join('')
    .replace(UNMAPPED, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

type Line = { text: string; y: number | null; height: number };

// One page's text from its items (`(await page.getTextContent()).items`).
// Items without `str` (marked-content markers) are skipped.
export function pageText(items: readonly unknown[]): string {
  const lines: Line[] = [];
  let runs: TextItem[] = [];
  function endLine() {
    const printed = runs.filter((run) => run.str.trim() !== '');
    lines.push({
      text: lineText(runs),
      y: printed.length > 0 ? printed[0].transform[5] : null,
      height: Math.max(0, ...printed.map((run) => run.height || 0)),
    });
    runs = [];
  }
  for (const raw of items) {
    const item = raw as TextItem;
    if (typeof item.str !== 'string') continue;
    const last = runs.length > 0 ? runs[runs.length - 1] : null;
    // A run well above or below the last one starts a new line.
    if (
      last !== null &&
      item.str.trim() !== '' &&
      last.str.trim() !== '' &&
      Math.abs(last.transform[5] - item.transform[5]) > Math.max(last.height || 0, item.height || 0) / 2
    ) {
      endLine();
    }
    runs.push(item);
    if (item.hasEOL) endLine();
  }
  if (runs.length > 0) endLine();

  const printed = lines.filter((line) => line.text !== '' && line.y !== null);
  const gaps: number[] = [];
  for (let i = 1; i < printed.length; i++) {
    const gap = printed[i - 1].y! - printed[i].y!;
    if (gap > 0) gaps.push(gap);
  }
  const lineGap = median(gaps);
  let out = '';
  let previous: Line | null = null;
  let blank = false;
  for (const line of lines) {
    if (line.text === '' || line.y === null) {
      blank = true;
      continue;
    }
    if (previous !== null) {
      const gap = previous.y! - line.y;
      const wide = lineGap > 0 ? gap > lineGap * 1.4 : gap > Math.max(previous.height, line.height) * 1.8;
      out += blank || wide || gap < 0 ? '\n\n' : '\n';
    }
    out += line.text;
    previous = line;
    blank = false;
  }
  return out;
}

// The whole Transcript from its pages' texts, as the phone joins them.
export function documentText(pages: readonly string[]): string {
  return pages.filter((page) => page !== '').join('\n\n');
}
