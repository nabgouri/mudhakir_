// The page the hidden WebView loads to read a Transcript's text with pdf.js
// (./extract.tsx). It is a string, not a function turned into one, because
// Hermes keeps no source text for functions.
//
// The app injects `extract(pdfSource, workerSource, base64)`: the two pdf.js
// builds as source text and the PDF as base64. Both builds are loaded as
// modules from blob URLs; the worker build, loaded first, sets
// `globalThis.pdfjsWorker`, so pdf.js parses in this page without a worker
// file. The page posts `{ ready: true }` once loaded, then one
// `{ ok: true, text }` or `{ ok: false, error }`.
//
// Text comes out page by page: a line break after each printed line, and a
// blank line (a paragraph break, which the splitter uses) where the gap to
// the next line is clearly wider than a line, and between pages.

export const EXTRACTOR_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"></head><body><script>
function post(message) {
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
}

async function moduleFrom(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

// Glyphs the PDF gives no Unicode for come out as control characters.
const UNMAPPED = /[\\u0000-\\u0008\\u000B-\\u001F\\uFFFD]/g;

// pdf.js gives each run of text in reading order, but the runs of a line in
// the order they were drawn, which for Arabic is often left to right. So
// each line's runs are put in order by position: right to left when most of
// the line is right-to-left text.
function lineText(runs) {
  let rtl = 0;
  let ltr = 0;
  for (const run of runs) {
    const letters = run.str.replace(/[\\s\\d\\p{P}]/gu, '').length;
    if (run.dir === 'rtl') rtl += letters;
    else ltr += letters;
  }
  const sorted = runs.slice().sort(function (a, b) {
    return rtl > ltr ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4];
  });
  return sorted.map(function (run) { return run.str; }).join('').replace(UNMAPPED, '').replace(/[ \\t]+/g, ' ').trim();
}

function pageText(items) {
  const lines = [];
  let runs = [];
  function endLine() {
    const printed = runs.filter(function (run) { return run.str.trim() !== ''; });
    lines.push({
      text: lineText(runs),
      y: printed.length > 0 ? printed[0].transform[5] : null,
      height: Math.max.apply(null, [0].concat(printed.map(function (run) { return run.height || 0; }))),
    });
    runs = [];
  }
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const last = runs.length > 0 ? runs[runs.length - 1] : null;
    // A run well above or below the last one starts a new line.
    if (last !== null && item.str.trim() !== '' && last.str.trim() !== '' &&
        Math.abs(last.transform[5] - item.transform[5]) > Math.max(last.height || 0, item.height || 0) / 2) {
      endLine();
    }
    runs.push(item);
    if (item.hasEOL) endLine();
  }
  if (runs.length > 0) endLine();

  const printed = lines.filter(function (line) { return line.text !== '' && line.y !== null; });
  const gaps = [];
  for (let i = 1; i < printed.length; i++) {
    const gap = printed[i - 1].y - printed[i].y;
    if (gap > 0) gaps.push(gap);
  }
  const lineGap = median(gaps);
  let out = '';
  let previous = null;
  let blank = false;
  for (const line of lines) {
    if (line.text === '' || line.y === null) {
      blank = true;
      continue;
    }
    if (previous !== null) {
      const gap = previous.y - line.y;
      const wide = lineGap > 0 ? gap > lineGap * 1.4 : gap > Math.max(previous.height, line.height) * 1.8;
      out += blank || wide || gap < 0 ? '\\n\\n' : '\\n';
    }
    out += line.text;
    previous = line;
    blank = false;
  }
  return out;
}

window.extract = async function (pdfSource, workerSource, base64) {
  try {
    await moduleFrom(workerSource);
    const pdfjs = await moduleFrom(pdfSource);
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    const task = pdfjs.getDocument({ data: data, isEvalSupported: false, disableFontFace: true });
    const doc = await task.promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push(pageText((await page.getTextContent()).items));
      page.cleanup();
    }
    await task.destroy();
    post({ ok: true, text: pages.filter(function (page) { return page !== ''; }).join('\\n\\n') });
  } catch (error) {
    post({ ok: false, error: String((error && error.message) || error) });
  }
};

post({ ready: true });
</script></body></html>`;
