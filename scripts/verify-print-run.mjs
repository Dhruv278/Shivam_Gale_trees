/**
 * Printability report - run before ANY production print run.
 * Photos still missing = the gap to close (fatal for a FINAL run).
 * A photographed species without a plate template = fatal.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATE_TEMPLATES } from '../src/lib/plate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const trees = JSON.parse(await readFile(join(root, 'src', 'data', 'trees.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'src', 'data', 'manifest.json'), 'utf8'));

const survey = new Map(); // species -> survey count
for (const t of trees) survey.set(t.species, (survey.get(t.species) ?? 0) + 1);
const photos = new Map(); // species -> photographed count
for (const e of manifest) photos.set(e.species, (photos.get(e.species) ?? 0) + 1);

let fatal = 0;
console.log(`Survey: ${trees.length} trees, ${survey.size} species · Photographed: ${manifest.length}\n`);
console.log('Species              survey  photos  template');
for (const [species, total] of [...survey.entries()].sort()) {
  const got = photos.get(species) ?? 0;
  const hasTemplate = Boolean(PLATE_TEMPLATES[species]);
  if (got > 0 && !hasTemplate) fatal += 1;
  const flag = got > 0 && !hasTemplate ? '  <- photographed but NO TEMPLATE' : '';
  console.log(
    `${species.padEnd(20)} ${String(total).padStart(6)}  ${String(got).padStart(6)}  ${hasTemplate ? 'ok     ' : 'missing'}${flag}`,
  );
}
console.log(`\nGap: ${trees.length - manifest.length} tree(s) still without photos.`);
if (fatal > 0) {
  console.error(`${fatal} photographed species have no plate template - their plates cannot be produced.`);
  process.exit(1);
}
console.log('Every photographed species has a plate template.');
