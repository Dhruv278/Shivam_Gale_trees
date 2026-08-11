/**
 * Scans public/images and writes src/data/manifest.json.
 *
 * Runs via the `predev` / `prebuild` npm hooks so dev and production always agree,
 * and so nothing has to touch the filesystem at request time (Vercel's runtime
 * filesystem is read-only).
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/lib/naming.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = join(root, 'public', 'images');
const outFile = join(root, 'src', 'data', 'manifest.json');

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

const fileNames = await readImageNames();
const { entries, warnings } = buildManifest(fileNames);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

const skipped = fileNames.length - entries.length;
console.log(`[manifest] ${entries.length} image(s) -> src/data/manifest.json`);
if (skipped > 0) console.log(`[manifest] skipped ${skipped} unsupported file(s).`);
for (const w of warnings) console.warn(`[manifest] ${w}`);
if (entries.length === 0) {
  console.warn('[manifest] No images found. Drop files into public/images/ and re-run.');
}
