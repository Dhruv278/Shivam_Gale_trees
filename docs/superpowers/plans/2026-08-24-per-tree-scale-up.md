# Per-Tree Scale-Up (species sections, photo-driven manifest, bundle ZIPs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app from 45 flat species entries to a per-tree model: photos dropped into `public/images/<Species>/` become trees (validated against the survey Excel), the portal shows one section per species, and downloads produce per-species folders containing `images/`, `qr/`, and `plates/` with matching file names.

**Architecture:** A one-time import converts the Excel into committed `src/data/trees.json` (1,777 trees, the identity source). `scripts/build-manifest.mjs` scans the species photo folders and emits one manifest entry per tree **that has a photo** — during the test phase that is the 45 existing images split into 3 species folders; at production it is all ~1,700 photos, with `verify-print` reporting the gap against the Excel. Tree slugs are deterministic (`slugify(species)-number`), guarded against the legacy `slug-lock.json` (kept frozen as a tombstone). The portal renders collapsible species sections with per-species and master bundle ZIPs; the plate page picks any photographed tree.

**Tech Stack:** Next.js 16 (app router, static export), vitest, exceljs (dev, import only), @napi-rs/canvas (dev, production print script), existing qrcode + jszip.

**Spec:** `docs/plate-plan.html` + user refinements of 2026-08-24 (species sections; master ZIP = `<Species>/{images,qr,plates}/<same base name>`; 45 images become test photos in 2–3 species folders; photos-present drive the manifest).

## Global Constraints

- A QR encodes only a viewer URL (`<base>/view/<slug>`), never an image path.
- Tree slugs are `slugify(species)-<number>`, deterministic, and must never collide with any slug in `src/data/slug-lock.json` (assignments or retired) — build fails loudly on collision. `slug-lock.json` is never modified again.
- Every manifest entry must correspond to a tree in `trees.json` (species exists, number within that species' survey range); violations are warnings and the photo is skipped, never silently renumbered.
- Bundle layout (ZIPs and the production output directory are identical): `<Species>/images/<Name>.<ext>`, `<Species>/qr/<Name>.png`, `<Species>/plates/<Name>.jpg` where `<Name>` = `"<Species> <number>"`.
- The site stays fully static (`output: 'export'`); nothing reads the filesystem at request time.
- All new pure logic lives in `src/lib/*.mjs` with vitest tests, TDD (test first, watch it fail).
- Node 22, Windows dev machine, never `git push`. Commit after every task.

## Excel ground truth (measured)

- Sheets `Block 01`…`Block 10` (ignore `Cumulative` — degenerate 40k-column used range). Rows 1–3 title, row 4 header, data from row 5; columns: A Sr.No, B Name ("Aam -15"), C Scientific, D Location, E Lifespan, F O2, G CO2. 1,777 rows, 45 species, numbering continues across blocks.

---

### Task 0: Commit the plate prototype + plan artifacts

**Files:** Modify `.gitignore`; commit the working tree.

- [ ] **Step 1:** `git status --porcelain` — expect the prototype files (`src/lib/plate.*`, `src/components/PlateStudio.js`, `src/app/plate/page.js`, `public/plates/aam.jpg`, `public/fonts/STENCIL.TTF`), `docs/`, possibly `AGENTS.md` (commit it — its own text says so), the Excel, two WhatsApp reference JPEGs.
- [ ] **Step 2:** Append to `.gitignore`:

```
# Reference photos sent over WhatsApp; the usable copies live in public/plates/.
/WhatsApp Image *.jpeg
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore AGENTS.md docs src/lib/plate.mjs src/lib/plate.test.mjs src/components/PlateStudio.js src/app/plate/page.js public/plates public/fonts "Revised Tree survey 2026-27.xlsx"
git commit -m "feat: plate prototype page (/plate) + scale-up plan and survey data"
```

---

### Task 1: Tree identity (`src/lib/trees.mjs`): parse, slug, name

**Files:** Create `src/lib/trees.mjs`; Test `src/lib/trees.test.mjs`.

**Interfaces:**
- Consumes: `slugify` from `./naming.mjs`.
- Produces: `parseTreeName(raw) -> {species, number}|null`; `treeSlug(species, number) -> string`; `treeName(species, number) -> string` (`"Aam 1"`).

- [ ] **Step 1: Failing test**

```js
// src/lib/trees.test.mjs
import { describe, expect, test } from 'vitest';
import { parseTreeName, treeName, treeSlug } from './trees.mjs';

describe('parseTreeName', () => {
  test('parses "Species -N" with any spacing around the dash', () => {
    expect(parseTreeName('Aam -15')).toEqual({ species: 'Aam', number: 15 });
    expect(parseTreeName('Amaltas-1')).toEqual({ species: 'Amaltas', number: 1 });
    expect(parseTreeName('Royal Palm -103')).toEqual({ species: 'Royal Palm', number: 103 });
    expect(parseTreeName('  Saal - 1 ')).toEqual({ species: 'Saal', number: 1 });
  });
  test('returns null for non-tree strings', () => {
    expect(parseTreeName('')).toBeNull();
    expect(parseTreeName('Name of Tree')).toBeNull();
    expect(parseTreeName('Aam')).toBeNull();
  });
});

describe('treeSlug / treeName', () => {
  test('deterministic slug', () => {
    expect(treeSlug('Aam', 1)).toBe('aam-1');
    expect(treeSlug('Royal Palm', 103)).toBe('royal-palm-103');
  });
  test('display name', () => {
    expect(treeName('Aam', 1)).toBe('Aam 1');
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/trees.test.mjs` — FAIL (module missing).
- [ ] **Step 3: Implement**

```js
// src/lib/trees.mjs
/**
 * Per-tree identity, derived from the survey Excel.
 *
 * A tree's identity IS its Excel name: species + running number. "Aam -15" is
 * "Aam -15" forever, so treeSlug is deterministic and needs no allocation
 * state (unlike image files, whose slugs needed the slug-lock because
 * filenames get renamed). The build still guards against collisions with the
 * legacy lock (scripts/build-manifest.mjs).
 */
import { slugify } from './naming.mjs';

/** "Royal Palm -103" -> { species: 'Royal Palm', number: 103 }; null if not a tree name. */
export function parseTreeName(raw) {
  const match = /^(.*?)\s*-\s*(\d+)\s*$/.exec(String(raw ?? '').trim());
  if (!match || !match[1].trim()) return null;
  return { species: match[1].trim(), number: Number(match[2]) };
}

/** ('Aam', 1) -> 'aam-1' — the permanent viewer slug printed inside the QR. */
export function treeSlug(species, number) {
  return `${slugify(species)}-${number}`;
}

/** ('Aam', 1) -> 'Aam 1' — the human-facing name; also the bundle file base name. */
export function treeName(species, number) {
  return `${species} ${number}`;
}
```

- [ ] **Step 4:** `npx vitest run src/lib/trees.test.mjs` — PASS.
- [ ] **Step 5: Commit** — `git add src/lib/trees.mjs src/lib/trees.test.mjs && git commit -m "feat: tree identity parsing and deterministic per-tree slugs"`

---

### Task 2: Excel import → committed `src/data/trees.json`

**Files:** Create `scripts/import-survey.mjs`; Modify `package.json` (devDep `exceljs`, script `import-survey`); Generate + commit `src/data/trees.json`.

**Interfaces:**
- Produces: `src/data/trees.json` — sorted `{species, number, block, location, scientific}[]` (species asc, number asc). The identity universe for every later task.

- [ ] **Step 1:** `npm install --save-dev exceljs`
- [ ] **Step 2: Script**

```js
// scripts/import-survey.mjs
/**
 * One-time (re-runnable) import: survey Excel -> src/data/trees.json.
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
  if (!blockMatch) continue;
  const block = Number(blockMatch[1]);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;
    const rawName = String(row.getCell(2).text ?? '').trim();
    if (!rawName) return;
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
console.log(`[import] ${trees.length} trees, ${new Set(trees.map((t) => t.species)).size} species -> src/data/trees.json`);
```

Add `"import-survey": "node scripts/import-survey.mjs"` to package.json scripts.

- [ ] **Step 3:** `npm run import-survey` — expect exactly `[import] 1777 trees, 45 species -> src/data/trees.json`. On any problem line, inspect that Excel row; never weaken the checks.
- [ ] **Step 4:** Spot check: `node -e "const t=require('./src/data/trees.json'); console.log(t.length, t.filter(x=>x.species==='Aam').length, t.filter(x=>x.species==='Ashok').length)"` — expect `1777 93 323`.
- [ ] **Step 5: Commit** — `git add scripts/import-survey.mjs package.json package-lock.json src/data/trees.json && git commit -m "feat: import survey Excel into committed trees.json (1777 trees, 45 species)"`

---

### Task 3: Split the 45 images into 3 test species folders

**Files:** `git mv` all 45 files from `public/images/*.jpg` into `public/images/{Aam,Aavla,Ashok}/`.

The 45 current images are stand-in test photos until the real ~1,700 arrive. Species folder names must match Excel species exactly. Numbers must be within survey range (Aam ≤ 93, Aavla ≤ 50, Ashok ≤ 323 — 1..15 is safe everywhere).

- [ ] **Step 1: Move + rename deterministically** (PowerShell, from repo root; sorted order, 15 per species)

```powershell
$files = Get-ChildItem public/images -File | Sort-Object Name
$species = @('Aam','Aavla','Ashok')
for ($i = 0; $i -lt $files.Count; $i++) {
  $s = $species[[math]::Floor($i / 15)]
  $n = ($i % 15) + 1
  New-Item -ItemType Directory -Force "public/images/$s" | Out-Null
  git mv $files[$i].FullName "public/images/$s/$s $n.jpg"
}
```

- [ ] **Step 2: Verify** — `Get-ChildItem public/images -Recurse -File | Measure-Object` → 45; `Get-ChildItem public/images -File` → 0 root files; each species folder has `"<Species> 1.jpg"`…`"<Species> 15.jpg"`.
- [ ] **Step 3: Commit** — `git add -A public/images && git commit -m "test-data: split the 45 posters into Aam/Aavla/Ashok tree photo folders"`

---

### Task 4: `extractPhotoNumber` + photo-driven `buildTreeManifest`

**Files:** Modify `src/lib/trees.mjs` (append); Test `src/lib/trees.test.mjs` (append).

**Interfaces:**
- Produces: `extractPhotoNumber(baseName) -> int|null`; `buildTreeManifest(trees, photosBySpecies) -> {entries, warnings}` where `photosBySpecies = { [species]: { [number]: 'Species/File.jpg' } }` and each entry is `{ species, number, slug, name, file, qrName }` (`qrName` = `"<Name>.png"` basename; sorted species asc then number asc). Photos whose species is not in the survey, or whose number exceeds that species' range, produce warnings and no entry.

- [ ] **Step 1: Failing tests** (append)

```js
import { buildTreeManifest, extractPhotoNumber } from './trees.mjs';

describe('extractPhotoNumber', () => {
  test('takes the trailing number from any accepted photo name', () => {
    expect(extractPhotoNumber('Aam 1')).toBe(1);
    expect(extractPhotoNumber('Aam-12')).toBe(12);
    expect(extractPhotoNumber('Aam -7')).toBe(7);
    expect(extractPhotoNumber('3')).toBe(3);
    expect(extractPhotoNumber('Aam')).toBeNull();
  });
});

describe('buildTreeManifest', () => {
  const trees = [
    { species: 'Aam', number: 1 },
    { species: 'Aam', number: 2 },
    { species: 'Ber', number: 1 },
  ];

  test('one entry per photographed tree, sorted, with derived fields', () => {
    const photos = { Aam: { 2: 'Aam/Aam 2.jpg', 1: 'Aam/Aam 1.jpg' } };
    const { entries, warnings } = buildTreeManifest(trees, photos);
    expect(warnings).toEqual([]);
    expect(entries).toEqual([
      { species: 'Aam', number: 1, slug: 'aam-1', name: 'Aam 1', file: 'Aam/Aam 1.jpg', qrName: 'Aam 1.png' },
      { species: 'Aam', number: 2, slug: 'aam-2', name: 'Aam 2', file: 'Aam/Aam 2.jpg', qrName: 'Aam 2.png' },
    ]);
  });

  test('warns and skips photos outside the survey', () => {
    const photos = { Aam: { 99: 'Aam/Aam 99.jpg' }, Ghost: { 1: 'Ghost/Ghost 1.jpg' } };
    const { entries, warnings } = buildTreeManifest(trees, photos);
    expect(entries).toEqual([]);
    expect(warnings.some((w) => w.includes('Aam/Aam 99.jpg'))).toBe(true);
    expect(warnings.some((w) => w.includes('Ghost'))).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — FAIL (not exported).
- [ ] **Step 3: Implement** (append to `trees.mjs`)

```js
/** "Aam -12" / "Aam 12" / "12" -> 12. Photo filenames only need to END in the tree number. */
export function extractPhotoNumber(baseName) {
  const match = /(\d+)\s*$/.exec(String(baseName).trim());
  return match ? Number(match[1]) : null;
}

/**
 * Photos present -> manifest entries, validated against the survey.
 *
 * The manifest is photo-driven by design: a tree appears (viewer page, QR,
 * plate) once its photo lands in public/images/<Species>/. The survey is the
 * validator - a photo for a tree the Excel does not know is a warning and is
 * skipped, never silently admitted or renumbered.
 */
export function buildTreeManifest(trees, photosBySpecies) {
  const maxBySpecies = new Map();
  for (const t of trees) {
    maxBySpecies.set(t.species, Math.max(maxBySpecies.get(t.species) ?? 0, t.number));
  }

  const entries = [];
  const warnings = [];
  for (const [species, byNumber] of Object.entries(photosBySpecies ?? {})) {
    const max = maxBySpecies.get(species);
    if (max === undefined) {
      warnings.push(`Folder "${species}" is not a species in the survey - skipped ${Object.keys(byNumber).length} photo(s).`);
      continue;
    }
    for (const [numberKey, file] of Object.entries(byNumber)) {
      const number = Number(numberKey);
      if (!Number.isInteger(number) || number < 1 || number > max) {
        warnings.push(`Photo "${file}": ${species} has trees 1-${max} in the survey, got ${numberKey} - skipped.`);
        continue;
      }
      entries.push({
        species,
        number,
        slug: treeSlug(species, number),
        name: treeName(species, number),
        file,
        qrName: `${treeName(species, number)}.png`,
      });
    }
  }

  entries.sort((a, b) => (a.species < b.species ? -1 : a.species > b.species ? 1 : a.number - b.number));
  return { entries, warnings };
}
```

- [ ] **Step 4:** Run — PASS. Full suite green: `npx vitest run`.
- [ ] **Step 5: Commit** — `git add src/lib/trees.mjs src/lib/trees.test.mjs && git commit -m "feat: photo-driven buildTreeManifest validated against the survey"`

---

### Task 5: `encodePath` in naming.mjs

**Files:** Modify `src/lib/naming.mjs` (append); Test `src/lib/naming.test.mjs` (append; extend the import).

**Interfaces:** `encodePath('Aam/Aam 1.jpg') -> 'Aam/Aam%201.jpg'` — segment-wise encodeURIComponent keeping `/`.

- [ ] **Step 1: Failing test** (append; add `encodePath` to the test file's naming.mjs import)

```js
describe('encodePath', () => {
  test('encodes each segment but keeps folder separators', () => {
    expect(encodePath('Aam/Aam 1.jpg')).toBe('Aam/Aam%201.jpg');
    expect(encodePath('Mango sample.jpg')).toBe('Mango%20sample.jpg');
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/naming.test.mjs` — FAIL.
- [ ] **Step 3: Implement** (append to naming.mjs)

```js
/** URL-encode a relative image path one segment at a time, preserving '/'. */
export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}
```

- [ ] **Step 4:** Run — PASS; full suite green.
- [ ] **Step 5: Commit** — `git add src/lib/naming.mjs src/lib/naming.test.mjs && git commit -m "feat: encodePath for sub-folder image URLs"`

---

### Task 6: Rewrite `scripts/build-manifest.mjs` (photo scan → per-tree manifest)

**Files:** Modify `scripts/build-manifest.mjs` (full rewrite, same path).

**Interfaces:**
- Consumes: `trees.json`, `slug-lock.json` (read-only guard), `buildTreeManifest`/`extractPhotoNumber` (trees.mjs), `isSupported`/`splitName` (naming.mjs).
- Produces: `src/data/manifest.json` (photo-driven entries). Never writes `slug-lock.json`.

- [ ] **Step 1: Rewrite**

```js
// scripts/build-manifest.mjs
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
```

- [ ] **Step 2:** `npm run manifest` — expect `[manifest] 45 tree(s) across 3 species`, `1732 still waiting for photos`, no warnings.
- [ ] **Step 3:** Full suite: `npx vitest run` — `naming.test.mjs` (legacy buildManifest tests) must still pass; `buildManifest` stays exported in naming.mjs as documentation of the frozen lock semantics.
- [ ] **Step 4: Commit** — `git add scripts/build-manifest.mjs src/data/manifest.json && git commit -m "feat: photo-driven per-tree manifest build with legacy slug guard"`

---

### Task 7: Viewer per-tree pages

**Files:** Modify `src/app/view/[slug]/page.js`.

- [ ] **Step 1:** Add `import { encodePath } from '@/lib/naming.mjs';` and replace `const src = \`/images/${encodeURIComponent(entry.file)}\`;` with:

```js
// `file` contains a species folder ("Aam/Aam 1.jpg"); encode per segment.
const src = `/images/${encodePath(entry.file)}`;
```

- [ ] **Step 2:** `npm run build` — succeeds; `/view/[slug]` lists 45 paths (e.g. `/view/aam-1`, `/view/aavla-3`, `/view/ashok-15`).
- [ ] **Step 3:** Dev server + headless Chrome screenshot of `/view/aam-1` — the photo renders full-screen on the dark backdrop.
- [ ] **Step 4: Commit** — `git add "src/app/view/[slug]/page.js" && git commit -m "feat: per-tree viewer pages"`

---

### Task 8: Bundle path layout (`src/lib/bundle.mjs`)

**Files:** Create `src/lib/bundle.mjs`; Test `src/lib/bundle.test.mjs`.

**Interfaces:**
- Consumes: manifest entry `{ species, name, file }`; `splitName` from naming.mjs.
- Produces: `bundlePaths(entry, hasTemplate) -> { image, qr, plate|null }` — the exact ZIP/disk layout every downstream consumer (browser ZIPs Task 10, production script Task 12) must use:
  - `image`: `"Aam/images/Aam 1.jpg"` (extension copied from the source file)
  - `qr`: `"Aam/qr/Aam 1.png"`
  - `plate`: `"Aam/plates/Aam 1.jpg"` or `null` when the species has no template.

- [ ] **Step 1: Failing test**

```js
// src/lib/bundle.test.mjs
import { describe, expect, test } from 'vitest';
import { bundlePaths } from './bundle.mjs';

describe('bundlePaths', () => {
  const entry = { species: 'Aam', name: 'Aam 1', file: 'Aam/IMG_1234 1.jpg' };

  test('same base name across the three folders, extension from the source image', () => {
    expect(bundlePaths(entry, true)).toEqual({
      image: 'Aam/images/Aam 1.jpg',
      qr: 'Aam/qr/Aam 1.png',
      plate: 'Aam/plates/Aam 1.jpg',
    });
  });

  test('no plate path when the species has no template yet', () => {
    expect(bundlePaths(entry, false).plate).toBeNull();
  });
});
```

- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Implement**

```js
// src/lib/bundle.mjs
/**
 * The one place that knows the download bundle layout:
 *   <Species>/images/<Name>.<ext>  - the original photo bytes
 *   <Species>/qr/<Name>.png        - the QR PNG
 *   <Species>/plates/<Name>.jpg    - the composed plate
 * Same base name in all three folders so any file identifies its tree at a
 * glance. Browser ZIPs and the production disk output both use this.
 */
import { splitName } from './naming.mjs';

export function bundlePaths(entry, hasTemplate) {
  const ext = splitName(entry.file).ext.toLowerCase() || '.jpg';
  return {
    image: `${entry.species}/images/${entry.name}${ext}`,
    qr: `${entry.species}/qr/${entry.name}.png`,
    plate: hasTemplate ? `${entry.species}/plates/${entry.name}.jpg` : null,
  };
}
```

- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** — `git add src/lib/bundle.mjs src/lib/bundle.test.mjs && git commit -m "feat: canonical bundle path layout"`

---

### Task 9: Plate template registry

**Files:** Modify `src/lib/plate.mjs`; Modify `src/lib/plate.test.mjs`.

**Interfaces:**
- Produces: `PLATE_TEMPLATES` (`{ Aam: {species, template, width, height, qrBox, number} }`), `getPlateTemplate(species) -> config|null`. `AAM_PLATE` export REMOVED (Task 10 rewrites its only consumer). `drawPlate`, `plateFileName` unchanged.

- [ ] **Step 1:** In `plate.test.mjs` change the import to `{ PLATE_TEMPLATES, drawPlate, getPlateTemplate, plateFileName }`, replace `AAM_PLATE` with `PLATE_TEMPLATES.Aam` everywhere, append:

```js
describe('getPlateTemplate', () => {
  test('config for a templated species, null otherwise', () => {
    expect(getPlateTemplate('Aam')).toBe(PLATE_TEMPLATES.Aam);
    expect(getPlateTemplate('Neem')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/plate.test.mjs` — FAIL (no `PLATE_TEMPLATES`).
- [ ] **Step 3:** In `plate.mjs` replace the `AAM_PLATE` export block with (keep the calibration comment):

```js
export const PLATE_TEMPLATES = Object.freeze({
  Aam: Object.freeze({
    species: 'Aam',
    template: '/plates/aam.jpg',
    width: 1600,
    height: 1309,
    qrBox: Object.freeze({ x: 1027, y: 304, size: 229 }),
    number: Object.freeze({ centerX: 733, centerY: 363, fontSize: 349 }),
  }),
});

/** Template for a species, or null while its artwork has not been delivered yet. */
export function getPlateTemplate(species) {
  return PLATE_TEMPLATES[species] ?? null;
}
```

- [ ] **Step 4:** `npx vitest run` — lib tests green (PlateStudio is broken until Task 10; do not build yet).
- [ ] **Step 5: Commit** — `git add src/lib/plate.mjs src/lib/plate.test.mjs && git commit -m "feat: plate template registry keyed by species"`

---

### Task 10: Shared browser plate renderer + portal species sections + bundle ZIPs + plate picker

This is the UI task. Three sub-parts, one commit.

**Files:**
- Create: `src/lib/plate-render.js` (browser-only shared helpers)
- Create: `src/components/SpeciesSection.js`
- Create: `src/components/BundlePanel.js`
- Modify: `src/components/ImageList.js` (rewrite as grouped sections)
- Modify: `src/components/ImageRow.js`
- Modify: `src/components/Portal.js`
- Delete: `src/components/GeneratePanel.js` (superseded by BundlePanel)
- Modify: `src/components/PlateStudio.js` (rewrite: picker over manifest)
- Modify: `src/app/plate/page.js`
- Modify: `src/app/page.js` (header caption)

**Interfaces:**
- `plate-render.js` produces: `loadImage(src) -> Promise<Image>`, `loadStencil() -> Promise<void>` (cached FontFace registration), `canvasToJpeg(canvas) -> Promise<Blob>` (quality 0.95), `renderPlateBlob({plate, baseUrl, slug, number, templateImage}) -> Promise<Blob>` (creates a work canvas, QR via `generateQrDataUrl`, `drawPlate`, returns JPEG blob).
- `BundlePanel` produces the master ZIP `all-species.zip`; `SpeciesSection` produces `<Species>.zip`; both share `buildBundleZip(entries, baseUrl, onProgress) -> Promise<Blob>` living in BundlePanel's module and exported: for each entry — fetch original bytes (`fetch('/images/' + encodePath(entry.file))`), QR data URL, plate blob when `getPlateTemplate(entry.species)` — placed at `bundlePaths(entry, hasTemplate)`; JSZip STORE; yields every 10 entries via `yieldToEventLoop`.

- [ ] **Step 1: `src/lib/plate-render.js`**

```js
'use client';

/**
 * Browser-side plate rendering shared by the plate page and the bundle ZIPs.
 * Kept out of plate.mjs so the pure geometry stays DOM-free and testable.
 */
import { drawPlate } from '@/lib/plate.mjs';
import { generateQrDataUrl } from '@/lib/qr.mjs';

export const JPEG_QUALITY = 0.95;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

let stencilPromise = null;
/** Register the Stencil face once; canvases silently fall back to serif without it. */
export function loadStencil() {
  stencilPromise ??= (async () => {
    const face = new FontFace('Stencil', 'url(/fonts/STENCIL.TTF)');
    await face.load();
    globalThis.document.fonts.add(face);
  })();
  return stencilPromise;
}

export function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/** Compose one plate to a JPEG blob on a throwaway canvas. */
export async function renderPlateBlob({ plate, baseUrl, slug, number, templateImage }) {
  await loadStencil();
  const qrImage = await loadImage(await generateQrDataUrl(baseUrl, slug));
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = plate.width;
  canvas.height = plate.height;
  drawPlate(canvas.getContext('2d'), { templateImage, qrImage, number, plate });
  return canvasToJpeg(canvas);
}
```

- [ ] **Step 2: `src/components/BundlePanel.js`** (also exports `buildBundleZip` for SpeciesSection)

```jsx
'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { bundlePaths } from '@/lib/bundle.mjs';
import { encodePath } from '@/lib/naming.mjs';
import { getPlateTemplate } from '@/lib/plate.mjs';
import { loadImage, renderPlateBlob } from '@/lib/plate-render.js';
import { downloadBlob, formatBytes, generateQrDataUrl, dataUrlToBase64, yieldToEventLoop } from '@/lib/qr.mjs';

/**
 * Builds a bundle ZIP: <Species>/{images,qr,plates}/<Name>.* for every entry.
 * Sequential on purpose - bounded memory and honest progress, same reasoning
 * as generateQrCodes. Template images are cached per species per run.
 *
 * NOTE test-scale tool: at 1,700 trees this holds the whole run in browser
 * memory - the production path is scripts/generate-print-files.mjs.
 */
export async function buildBundleZip(entries, baseUrl, onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const templates = new Map(); // species -> loaded template Image or null
  const failures = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    try {
      const plate = getPlateTemplate(entry.species);
      if (!templates.has(entry.species)) {
        templates.set(entry.species, plate ? await loadImage(plate.template) : null);
      }
      const paths = bundlePaths(entry, Boolean(plate));

      const res = await fetch(`/images/${encodePath(entry.file)}`);
      if (!res.ok) throw new Error(`image fetch ${res.status}`);
      zip.file(paths.image, await res.blob());

      zip.file(paths.qr, dataUrlToBase64(await generateQrDataUrl(baseUrl, entry.slug)), { base64: true });

      if (paths.plate) {
        zip.file(
          paths.plate,
          await renderPlateBlob({
            plate,
            baseUrl,
            slug: entry.slug,
            number: entry.number,
            templateImage: templates.get(entry.species),
          }),
        );
      }
    } catch (error) {
      failures.push({ name: entry.name, message: error?.message ?? String(error) });
    }
    onProgress?.({ done: i + 1, total: entries.length });
    if ((i + 1) % 10 === 0) await yieldToEventLoop();
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, failures };
}

/** "Download All" over the full manifest: every species folder in one ZIP. */
export default function BundlePanel({ entries, baseUrl }) {
  const [progress, setProgress] = useState(null); // null | {done, total}
  const [result, setResult] = useState(null); // null | {size, failures}
  const [error, setError] = useState(null);

  async function handleDownloadAll() {
    setProgress({ done: 0, total: entries.length });
    setResult(null);
    setError(null);
    try {
      const { blob, failures } = await buildBundleZip(entries, baseUrl, setProgress);
      downloadBlob(blob, 'all-species.zip');
      setResult({ size: blob.size, failures });
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setProgress(null);
    }
  }

  const speciesCount = new Set(entries.map((e) => e.species)).size;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Download everything</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {entries.length} trees · {speciesCount} species · each species folder holds{' '}
            <span className="font-mono">images/ · qr/ · plates/</span> with matching names
          </p>
        </div>
        <Button variant="primary" onClick={handleDownloadAll} disabled={progress !== null || !baseUrl || entries.length === 0}>
          {progress ? `Bundling ${progress.done} / ${progress.total}` : 'Download All (ZIP)'}
        </Button>
      </div>
      {result && (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">all-species.zip downloaded</span>
          <span className="text-zinc-500 dark:text-zinc-400"> ({formatBytes(result.size)})</span>
          {result.failures.length > 0 && (
            <span className="text-red-700 dark:text-red-400"> · {result.failures.length} tree(s) failed: {result.failures.map((f) => f.name).join(', ')}</span>
          )}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200">{error}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: `src/components/SpeciesSection.js`**

```jsx
'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import ImageRow from '@/components/ImageRow';
import { buildBundleZip } from '@/components/BundlePanel';
import { getPlateTemplate } from '@/lib/plate.mjs';
import { downloadBlob } from '@/lib/qr.mjs';
import { viewerUrl } from '@/lib/naming.mjs';

/**
 * One collapsible species section: its trees, its own bundle ZIP.
 * Collapsed by default so the page never mounts every thumbnail at once
 * (native lazy loading bounds the cost of an opened section).
 */
export default function SpeciesSection({ species, entries, baseUrl, defaultOpen = false }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const hasTemplate = Boolean(getPlateTemplate(species));

  async function handleDownload(event) {
    event.preventDefault(); // do not toggle the <details>
    setProgress({ done: 0, total: entries.length });
    setError(null);
    try {
      const { blob, failures } = await buildBundleZip(entries, baseUrl, setProgress);
      downloadBlob(blob, `${species}.zip`);
      if (failures.length > 0) setError(`${failures.length} tree(s) failed: ${failures.map((f) => f.name).join(', ')}`);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 select-none sm:px-5">
        <span className="flex items-baseline gap-3">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{species}</span>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {entries.length} {entries.length === 1 ? 'tree' : 'trees'} · {hasTemplate ? 'plate template ready' : 'plate template pending'}
          </span>
        </span>
        <Button size="sm" variant="secondary" onClick={handleDownload} disabled={progress !== null || !baseUrl}>
          {progress ? `Bundling ${progress.done}/${progress.total}` : `Download ${species}.zip`}
        </Button>
      </summary>
      {error && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:px-5 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">{error}</p>
      )}
      <ul className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
        {entries.map((entry) => (
          <ImageRow
            key={entry.slug}
            entry={entry}
            baseUrl={baseUrl}
            url={baseUrl ? viewerUrl(baseUrl, entry.slug) : `/view/${entry.slug}`}
          />
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: Rewrite `src/components/ImageList.js`** as the grouped list (search stays, pagination goes — sections are collapsed by default instead):

```jsx
'use client';

import { useMemo, useState } from 'react';
import SpeciesSection from '@/components/SpeciesSection';

/**
 * Species-sectioned catalogue. DOM cost is bounded by sections being
 * collapsed by default (a closed <details> renders no rows) plus native
 * lazy-loading of the 44px thumbnails inside an opened one.
 */
export default function ImageList({ entries, baseUrl }) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? entries.filter(
          (e) => e.name.toLowerCase().includes(needle) || e.species.toLowerCase().includes(needle),
        )
      : entries;
    const bySpecies = new Map();
    for (const entry of filtered) {
      (bySpecies.get(entry.species) ?? bySpecies.set(entry.species, []).get(entry.species)).push(entry);
    }
    return [...bySpecies.entries()]; // manifest is already (species, number) sorted
  }, [entries, query]);

  const shown = sections.reduce((a, [, list]) => a + list.length, 0);

  return (
    <section aria-labelledby="images-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="images-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {entries.length} {entries.length === 1 ? 'tree' : 'trees'} · {sections.length} species
          </h2>
          {query && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{shown} matching</p>
          )}
        </div>
        <label className="w-full sm:w-72">
          <span className="sr-only">Search trees</span>
          <input
            type="search"
            id="image-search"
            name="image-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tree or species…"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-500 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-zinc-500"
          />
        </label>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          No tree matches <span className="font-mono text-zinc-700 dark:text-zinc-200">{query}</span>.
        </p>
      ) : (
        sections.map(([species, list]) => (
          <SpeciesSection
            key={species}
            species={species}
            entries={list}
            baseUrl={baseUrl}
            defaultOpen={Boolean(query)}
          />
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 5: `src/components/ImageRow.js` tweaks** — add `import { encodePath } from '@/lib/naming.mjs';`; thumbnail `src={`/images/${encodePath(entry.file)}`}`; title `<p>…{entry.name}</p>`; aria-labels use `entry.name`; single QR download keeps `entry.qrName` (already a basename).
- [ ] **Step 6: `src/components/Portal.js`** — swap `GeneratePanel` import/usage for `BundlePanel` (same props: `entries`, `baseUrl`). Then `git rm src/components/GeneratePanel.js`.
- [ ] **Step 7: `src/app/page.js`** — header caption `{manifest.length} entries` → `{manifest.length} trees`.
- [ ] **Step 8: Rewrite `src/components/PlateStudio.js`** — picker over the manifest (only photographed trees are choosable; that is the honest set until more photos land):

```jsx
'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Button from '@/components/Button';
import { drawPlate, getPlateTemplate, plateFileName } from '@/lib/plate.mjs';
import { canvasToJpeg, loadImage, loadStencil } from '@/lib/plate-render.js';
import { viewerUrl } from '@/lib/naming.mjs';
import { downloadBlob, generateQrDataUrl, resolveBaseUrl } from '@/lib/qr.mjs';

const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => '';

/** Pick any photographed tree, preview its plate at print resolution, download the JPG. */
export default function PlateStudio({ entries }) {
  const bySpecies = useMemo(() => {
    const map = new Map();
    for (const e of entries) (map.get(e.species) ?? map.set(e.species, []).get(e.species)).push(e);
    return map;
  }, [entries]);
  const speciesList = [...bySpecies.keys()];

  const canvasRef = useRef(null);
  const [species, setSpecies] = useState(speciesList[0] ?? '');
  const [slug, setSlug] = useState(bySpecies.get(speciesList[0])?.[0]?.slug ?? '');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const envUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const origin = useSyncExternalStore(subscribeToOrigin, getOriginSnapshot, getServerOriginSnapshot);
  const baseUrl = resolveBaseUrl(envUrl, origin);

  const treesOfSpecies = bySpecies.get(species) ?? [];
  const entry = treesOfSpecies.find((e) => e.slug === slug) ?? treesOfSpecies[0];
  const plate = getPlateTemplate(species);
  const qrUrl = baseUrl && entry ? viewerUrl(baseUrl, entry.slug) : '';

  useEffect(() => {
    if (!baseUrl || !plate || !entry || !canvasRef.current) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [templateImage, qrDataUrl] = await Promise.all([
          loadImage(plate.template),
          generateQrDataUrl(baseUrl, entry.slug),
          loadStencil(),
        ]);
        const qrImage = await loadImage(qrDataUrl);
        if (cancelled) return;
        drawPlate(canvasRef.current.getContext('2d'), { templateImage, qrImage, number: entry.number, plate });
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? String(err));
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [baseUrl, plate, entry]);

  async function handleDownload() {
    downloadBlob(await canvasToJpeg(canvasRef.current), plateFileName(entry.species, entry.number));
  }

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No tree photos yet — drop some into public/images/&lt;Species&gt;/.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Species</span>
          <select
            value={species}
            onChange={(e) => {
              setSpecies(e.target.value);
              setSlug(bySpecies.get(e.target.value)?.[0]?.slug ?? '');
            }}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {speciesList.map((s) => (
              <option key={s} value={s}>
                {s} ({bySpecies.get(s).length}){getPlateTemplate(s) ? '' : ' — template pending'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Tree</span>
          <select
            value={entry?.slug ?? ''}
            onChange={(e) => setSlug(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {treesOfSpecies.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!plate ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
          No plate template for {species} yet. Drop its artwork in public/plates/ and register it in src/lib/plate.mjs.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <canvas
              ref={canvasRef}
              width={plate.width}
              height={plate.height}
              className="h-auto w-full"
              aria-label={`Tree plate for ${entry?.name ?? species}`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {status === 'loading' && 'Composing plate…'}
              {status === 'error' && <span className="text-red-600 dark:text-red-400">{error}</span>}
              {status === 'ready' && (
                <>QR encodes <span className="break-all text-zinc-800 dark:text-zinc-200">{qrUrl}</span></>
              )}
            </div>
            <Button variant="primary" onClick={handleDownload} disabled={status !== 'ready'}>
              Download Plate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 9: `src/app/plate/page.js`** — pass the manifest:

```jsx
import manifest from '@/data/manifest.json';
import PlateStudio from '@/components/PlateStudio';
```

header caption: `{manifest.length} trees · templates ready: Aam`, and `<PlateStudio entries={manifest} />`.

- [ ] **Step 10: Verify** — `npx vitest run` green; `npm run build` succeeds. CDP sweep with dev server: `/` shows "45 trees · 3 species", three collapsed sections with Download buttons; open Aam → 15 rows with thumbnails; click `Download Aam.zip` → ZIP arrives; unzip (in scratch) and assert exact paths `Aam/images/Aam 1.jpg`, `Aam/qr/Aam 1.png`, `Aam/plates/Aam 1.jpg` (45 files total: 15+15+15); `Download All (ZIP)` → `all-species.zip` with `Aam/…` (3 folders incl. plates) + `Aavla/…`, `Ashok/…` (images+qr only, 2 folders each — no templates); decode one QR from the ZIP → `/view/aam-7`; `/plate` picker renders Aam 7 plate, console error-free throughout.
- [ ] **Step 11: Commit**

```bash
git add -A src/components src/lib/plate-render.js src/app/plate/page.js src/app/page.js
git commit -m "feat: species sections with per-species and master bundle ZIPs (images/qr/plates)"
```

---

### Task 11: Pre-print verification script

**Files:** Create `scripts/verify-print-run.mjs`; Modify `package.json` (script `"verify-print"`).

**Interfaces:** Consumes `trees.json`, `manifest.json`, `PLATE_TEMPLATES`. Report per species: survey count, photo count, template status. Exit 1 when not printable (any photographed species without template, or photos ≠ survey — photos missing are listed as the gap).

- [ ] **Step 1: Script**

```js
// scripts/verify-print-run.mjs
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
  console.log(`${species.padEnd(20)} ${String(total).padStart(6)}  ${String(got).padStart(6)}  ${hasTemplate ? 'ok     ' : 'missing'}${flag}`);
}
console.log(`\nGap: ${trees.length - manifest.length} tree(s) still without photos.`);
if (fatal > 0) {
  console.error(`${fatal} photographed species have no plate template - their plates cannot be produced.`);
  process.exit(1);
}
console.log('Every photographed species has a plate template.');
```

- [ ] **Step 2:** `npm run verify-print` — expected NOW: table of 45 species; Aam `15 photos, ok`; Aavla + Ashok `15 photos, missing <- photographed but NO TEMPLATE`; exit 1. That is the correct, honest current state (2 templates outstanding for the test set).
- [ ] **Step 3: Commit** — `git add scripts/verify-print-run.mjs package.json && git commit -m "feat: pre-print verification report"`

---

### Task 12: Production print-files script (disk mirror of the bundle)

**Files:** Create `scripts/generate-print-files.mjs`; Modify `package.json` (devDep `@napi-rs/canvas`); Modify `.gitignore` (append `/output/`).

**Interfaces:** Consumes manifest, `bundlePaths`, `PLATE_TEMPLATES`, `drawPlate`, `viewerUrl`, `QR_OPTIONS`, qrcode `toBuffer`, `@napi-rs/canvas`. Produces `output/print/<Species>/{images,qr,plates}/<Name>.*` — identical layout to the ZIPs. Usage: `node scripts/generate-print-files.mjs https://final-domain`.

- [ ] **Step 1:** `npm install --save-dev @napi-rs/canvas` (prebuilt win32-x64, no compiler).
- [ ] **Step 2: Script**

```js
// scripts/generate-print-files.mjs
/**
 * THE production run: streams every tree's original image, QR PNG, and plate
 * JPG to output/print/ in the same <Species>/{images,qr,plates} layout as the
 * portal ZIPs - but on disk, so 1,700 trees never live in browser memory.
 *
 * Usage: node scripts/generate-print-files.mjs https://final-domain
 * The base URL is explicit and validated - these files go to a printer.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import { bundlePaths } from '../src/lib/bundle.mjs';
import { viewerUrl } from '../src/lib/naming.mjs';
import { PLATE_TEMPLATES, drawPlate } from '../src/lib/plate.mjs';
import { QR_OPTIONS } from '../src/lib/qr.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'output', 'print');
const manifest = JSON.parse(await readFile(join(root, 'src', 'data', 'manifest.json'), 'utf8'));

const baseUrl = process.argv[2];
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error('Usage: node scripts/generate-print-files.mjs https://final-domain');
  process.exit(1);
}
if (/localhost|127\.0\.0\.1|\.pages\.dev/.test(baseUrl)) {
  console.warn(`[print] WARNING: "${baseUrl}" does not look like a final production domain.`);
}

GlobalFonts.registerFromPath(join(root, 'public', 'fonts', 'STENCIL.TTF'), 'Stencil');

let plates = 0;
const templates = new Map();
const skipped = new Set();

for (const [i, entry] of manifest.entries()) {
  const plate = PLATE_TEMPLATES[entry.species] ?? null;
  const paths = bundlePaths(entry, Boolean(plate));
  const url = viewerUrl(baseUrl, entry.slug);

  const imageOut = join(outRoot, paths.image);
  await mkdir(dirname(imageOut), { recursive: true });
  await copyFile(join(root, 'public', 'images', entry.file), imageOut);

  const qrBuffer = await QRCode.toBuffer(url, { ...QR_OPTIONS });
  const qrOut = join(outRoot, paths.qr);
  await mkdir(dirname(qrOut), { recursive: true });
  await writeFile(qrOut, qrBuffer);

  if (plate) {
    if (!templates.has(entry.species)) {
      templates.set(entry.species, await loadImage(join(root, 'public', plate.template)));
    }
    const canvas = createCanvas(plate.width, plate.height);
    drawPlate(canvas.getContext('2d'), {
      templateImage: templates.get(entry.species),
      qrImage: await loadImage(qrBuffer),
      number: entry.number,
      plate,
    });
    const plateOut = join(outRoot, paths.plate);
    await mkdir(dirname(plateOut), { recursive: true });
    await writeFile(plateOut, canvas.toBuffer('image/jpeg', 95));
    plates += 1;
  } else {
    skipped.add(entry.species);
  }

  if ((i + 1) % 200 === 0) console.log(`[print] ${i + 1}/${manifest.length}…`);
}

console.log(`[print] ${manifest.length} trees -> output/print/ (${plates} plates)`);
if (skipped.size > 0) console.warn(`[print] no plates for: ${[...skipped].sort().join(', ')} (no template)`);
```

Add `"print-files": "node scripts/generate-print-files.mjs"` is NOT added (the URL argument is mandatory; npm scripts swallow args ambiguously — document the direct node invocation instead).

- [ ] **Step 3:** Run `node scripts/generate-print-files.mjs https://example.invalid` — expect 45 trees, 15 plates, warning for Aavla+Ashok. Verify: decode `output/print/Aam/qr/Aam 7.png` via the repo's jsqr (expect `https://example.invalid/view/aam-7`); open `output/print/Aam/plates/Aam 7.jpg` — 1600×1309 with "7". Delete `output/` (gitignored).
- [ ] **Step 4: Commit** — `git add scripts/generate-print-files.mjs package.json package-lock.json .gitignore && git commit -m "feat: production print-files script mirroring the bundle layout"`

---

### Task 13: Docs + final verification sweep

**Files:** Modify `README.md`; Modify `docs/plate-plan.html`.

- [ ] **Step 1: README** — add "Operator workflow (per-tree)": photo drop convention `public/images/<Species>/<anything ending in the tree number>.<ext>` (species folder = Excel spelling); `npm run import-survey` when a revised Excel lands; portal sections + `Download <Species>.zip` + `Download All`; `npm run verify-print` before printing; `node scripts/generate-print-files.mjs <final-domain>` for the production files; `trees.json`/`manifest.json` are committed artifacts; the 45 current photos are TEST stand-ins to be replaced by the real ~1,700.
- [ ] **Step 2: plan HTML** — mark phases: Phase 1 DONE (photo-driven), Phase 2 DONE (bundle ZIPs), Phase 3 DONE for Aam (44 templates pending), Phase 4 DONE (verify-print).
- [ ] **Step 3: Final gate (fresh evidence)** — `npx vitest run` green; `npm run build` (45 view paths, `/plate` static); CDP sweep: `/` sections + ZIP download re-verified, `/view/ashok-15` renders, `/plate` downloads `Aam-7-plate.jpg` whose QR decodes to `/view/aam-7`; no console errors.
- [ ] **Step 4: Commit** — `git add README.md docs/plate-plan.html && git commit -m "docs: per-tree operator workflow and phase status"`
