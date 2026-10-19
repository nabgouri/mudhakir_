// Copies the two pdf.js builds the Transcript extractor needs
// (src/transcript/extract.tsx) into assets/pdfjs/ as `.txt` assets, so
// Metro ships them as files for the WebView rather than bundling them as
// app code. Runs after `npm install`; the copies are not committed.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const from = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const to = path.join(root, 'assets', 'pdfjs');

if (!fs.existsSync(from)) {
  console.warn('pdfjs-dist is not installed; skipping the pdf.js copy');
  process.exit(0);
}
fs.mkdirSync(to, { recursive: true });
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  fs.copyFileSync(path.join(from, name), path.join(to, `${name}.txt`));
}
