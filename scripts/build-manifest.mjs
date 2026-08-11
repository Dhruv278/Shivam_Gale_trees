/**
 * Scans public/images and writes src/data/manifest.json.
 *
 * Runs via the `predev` / `prebuild` npm hooks so dev and production always agree,
 * and so nothing has to touch the filesystem at request time.
 *
 * Slug assignments are persisted in src/data/slug-lock.json, which MUST be committed.
 * That file is what guarantees a printed QR code keeps opening the same image after
 * new files are added - see the comment on buildManifest for why recomputing slugs
 * from the folder contents is not safe.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_LOCK, buildManifest } from '../src/lib/naming.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = join(root, 'public', 'images');
const manifestFile = join(root, 'src', 'data', 'manifest.json');
const lockFile = join(root, 'src', 'data', 'slug-lock.json');

async function readImageNames() {
  try {
    const dirents = await readdir(imagesDir, { withFileTypes: true });
    return dirents.filter((d) => d.isFile()).map((d) => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[manifest] ${imagesDir} does not exist yet - writing an empty manifest.`);
      return [];
    }
    throw err;
  }
}

async function readLock() {
  try {
    return JSON.parse(await readFile(lockFile, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[manifest] No slug lock yet - creating one. Commit it.');
      return EMPTY_LOCK;
    }
    throw err;
  }
}

const fileNames = await readImageNames();
const previousLock = await readLock();
const { entries, warnings, lock } = buildManifest(fileNames, previousLock);

/**
 * Defence in depth. The lock logic should make this impossible, but a printed QR
 * code silently pointing at the wrong poster is the single worst failure this
 * project can produce, so verify rather than trust.
 */
const changed = Object.entries(previousLock.assignments ?? {})
  .filter(([file, was]) => {
    const now = lock.assignments[file] ?? lock.retired[file];
    return now && now.slug !== was.slug;
  })
  .map(([file, was]) => `${file}: "${was.slug}" -> "${(lock.assignments[file] ?? lock.retired[file]).slug}"`);

if (changed.length > 0) {
  console.error('[manifest] ABORTING - a locked slug changed. Printed QR codes would break:');
  for (const c of changed) console.error(`  ${c}`);
  process.exit(1);
}

await mkdir(dirname(manifestFile), { recursive: true });
await writeFile(manifestFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

const newCount = Object.keys(lock.assignments).length - Object.keys(previousLock.assignments ?? {}).length;
const retiredCount = Object.keys(lock.retired).length;
const skipped = fileNames.length - entries.length;

console.log(`[manifest] ${entries.length} image(s) -> src/data/manifest.json`);
if (newCount > 0) console.log(`[manifest] ${newCount} newly assigned slug(s) - commit src/data/slug-lock.json.`);
if (retiredCount > 0) console.log(`[manifest] ${retiredCount} retired slug(s) held in reserve.`);
if (skipped > 0) console.log(`[manifest] skipped ${skipped} unsupported file(s).`);
for (const w of warnings) console.warn(`[manifest] ${w}`);
if (entries.length === 0) {
  console.warn('[manifest] No images found. Drop files into public/images/ and re-run.');
}
