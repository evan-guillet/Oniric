// Usage: npm run verifier-pdf -- scenario.pdf [scenario.attendu.json]
// Compares, page by page, the text and the vertical position of every line of the PDF
// with the layout computed by the editor.
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [pdfPath, expectedArg] = process.argv.slice(2);
if (!pdfPath) {
  console.error("Usage : npm run verifier-pdf -- scenario.pdf [scenario.attendu.json]");
  process.exit(2);
}
const expectedPath = expectedArg ?? pdfPath.replace(/\.pdf$/i, "") + ".attendu.json";
const expected = JSON.parse(await readFile(expectedPath, "utf8"));
const pdf = await getDocument({ data: new Uint8Array(await readFile(pdfPath)), verbosity: 0 }).promise;

const squash = (s) => s.replace(/\s+/g, "");
const LINE_PT = 12;

async function pdfLines(pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const rows = new Map();
  for (const item of content.items) {
    if (!("str" in item) || item.str.trim() === "") continue;
    const y = Math.round(item.transform[5] * 2) / 2;
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform[4], str: item.str });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, items]) => ({ y, text: items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ") }))
    .filter((l, i) => !(i === 0 && /^\d+\.$/.test(l.text.trim())));
}

let failures = 0;
const report = (msg) => {
  failures++;
  if (failures <= 30) console.log("  ✗ " + msg);
};

const skip = expected.titlePages ?? 0;
if (pdf.numPages !== expected.pages.length + skip) report(`nombre de pages : PDF ${pdf.numPages}, attendu ${expected.pages.length + skip}`);
let checked = 0;
for (let n = 1; n <= Math.min(pdf.numPages - skip, expected.pages.length); n++) {
  const got = await pdfLines(n + skip);
  const want = expected.pages[n - 1].lines;
  if (got.length !== want.length) report(`page ${n} : ${got.length} lignes dans le PDF, ${want.length} attendues`);
  const firstY = got[0]?.y ?? 0;
  const firstRow = want[0]?.row ?? 0;
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    checked++;
    if (squash(got[i].text) !== squash(want[i].text)) {
      report(`page ${n}, ligne ${i + 1} : PDF « ${got[i].text} » / attendu « ${want[i].text} »`);
      break;
    }
    const row = firstRow + Math.round((firstY - got[i].y) / LINE_PT);
    if (row !== want[i].row) {
      report(`page ${n}, ligne ${i + 1} : rang ${row} dans le PDF, ${want[i].row} attendu`);
      break;
    }
  }
}

console.log(`${pdf.numPages} pages, ${checked} lignes comparées, format ${expected.format}.`);
if (failures === 0) {
  console.log("✓ Le PDF correspond exactement à la pagination de l'éditeur.");
} else {
  console.log(`✗ ${failures} différence(s).`);
  process.exit(1);
}
