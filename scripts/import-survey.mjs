/**
 * One-time (re-runnable) import: survey Excel -> src/data/trees.json.
 *
 * trees.json is COMMITTED; builds never parse xlsx. Re-run only when a
 * revised Excel arrives. Block sheets only: the Cumulative sheet's used
 * range is degenerate (tens of thousands of empty columns).
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { parseTreeName } from '../src/lib/trees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const excelFile = join(root, 'Revised Tree survey 2026-27.xlsx');
const outFile = join(root, 'src', 'data', 'trees.json');
const EXPECTED_TOTAL = 1777;

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelFile);

const trees = [];
const problems = [];
const seen = new Set();

for (const sheet of workbook.worksheets) {
  const blockMatch = /^Block (\d+)$/.exec(sheet.name);
  if (!blockMatch) continue; // skip Cumulative and anything unexpected
  const block = Number(blockMatch[1]);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return; // rows 1-3 title, row 4 header
    const rawName = String(row.getCell(2).text ?? '').trim();
    if (!rawName) return; // trailing empty rows
    const parsed = parseTreeName(rawName);
    if (!parsed) {
      problems.push(`${sheet.name} row ${rowNumber}: unparseable name "${rawName}"`);
      return;
    }
    const key = `${parsed.species}#${parsed.number}`;
    if (seen.has(key)) {
      problems.push(`${sheet.name} row ${rowNumber}: duplicate tree ${key}`);
      return;
    }
    seen.add(key);
    trees.push({
      species: parsed.species,
      number: parsed.number,
      block,
      location: String(row.getCell(4).text ?? '').trim(),
      scientific: String(row.getCell(3).text ?? '').trim(),
    });
  });
}

trees.sort((a, b) => (a.species < b.species ? -1 : a.species > b.species ? 1 : a.number - b.number));

for (const p of problems) console.error(`[import] ${p}`);
if (problems.length > 0) process.exit(1);
if (trees.length !== EXPECTED_TOTAL) {
  console.error(`[import] ABORTING - expected ${EXPECTED_TOTAL} trees, found ${trees.length}.`);
  process.exit(1);
}

await writeFile(outFile, `${JSON.stringify(trees, null, 2)}\n`, 'utf8');
const species = new Set(trees.map((t) => t.species));
console.log(`[import] ${trees.length} trees, ${species.size} species -> src/data/trees.json`);
