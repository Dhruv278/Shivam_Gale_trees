/**
 * Photo drop folders x survey -> src/data/manifest.json (per-tree).
 * Runs via predev/prebuild so dev and production always agree.
 *
 * public/images/<Species>/<anything ending in the tree number>.<ext> is a
 * tree photo. Root-level files are ignored (there should be none; the test
 * set lives in species folders).
 *
 * slug-lock.json is the legacy file-based scheme, kept frozen: read ONLY to
 * assert no tree slug collides with a slug it ever issued.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSupported, splitName } from '../src/lib/naming.mjs';
import { buildTreeManifest, extractPhotoNumber } from '../src/lib/trees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = join(root, 'public', 'images');
const manifestFile = join(root, 'src', 'data', 'manifest.json');

const trees = JSON.parse(await readFile(join(root, 'src', 'data', 'trees.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'src', 'data', 'slug-lock.json'), 'utf8'));

const photosBySpecies = {};
const ignored = [];
for (const dirent of await readdir(imagesDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) {
    ignored.push(dirent.name);
    continue;
  }
  const species = dirent.name;
  for (const file of await readdir(join(imagesDir, species))) {
    if (!isSupported(file)) continue;
    const number = extractPhotoNumber(splitName(file).base);
    if (number === null) {
      ignored.push(`${species}/${file}`);
      continue;
    }
    (photosBySpecies[species] ??= {})[number] = `${species}/${file}`;
  }
}

const { entries, warnings } = buildTreeManifest(trees, photosBySpecies);

const slugSet = new Set(entries.map((e) => e.slug));
if (slugSet.size !== entries.length) {
  console.error('[manifest] ABORTING - duplicate tree slugs.');
  process.exit(1);
}
const legacySlugs = new Set(
  [...Object.values(lock.assignments ?? {}), ...Object.values(lock.retired ?? {})].map((r) => r.slug),
);
const collisions = entries.filter((e) => legacySlugs.has(e.slug)).map((e) => e.slug);
if (collisions.length > 0) {
  console.error(`[manifest] ABORTING - tree slug collides with legacy slug-lock: ${collisions.join(', ')}`);
  process.exit(1);
}

await writeFile(manifestFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

const speciesCount = new Set(entries.map((e) => e.species)).size;
console.log(`[manifest] ${entries.length} tree(s) across ${speciesCount} species -> src/data/manifest.json`);
console.log(`[manifest] survey has ${trees.length} trees; ${trees.length - entries.length} still waiting for photos.`);
for (const w of warnings) console.warn(`[manifest] ${w}`);
for (const i of ignored) console.warn(`[manifest] ignored (not a species folder / no trailing number): ${i}`);
if (entries.length === 0) console.warn('[manifest] No tree photos found. Drop files into public/images/<Species>/ and re-run.');
