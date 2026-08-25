/**
 * Exhaustive pre-print audit. Printed plates cannot be recalled, so this
 * checks EVERY artifact, not a sample:
 *
 *   1. survey <-> manifest: every tree photographed exactly once, slugs unique
 *   2. every QR PNG in output/print decodes to exactly its viewer URL
 *   3. every plate JPG: correct size, the QR cropped OUT OF THE PLATE PIXELS
 *      decodes to the same URL, digits present in the number band, and no
 *      glyph pixel touches the QR box
 *   4. every prerendered out/view/<slug>.html references exactly its own photo
 *   5. every copied original image byte-size-matches its source
 *
 * Usage: node scripts/audit-print-run.mjs <baseUrl>
 *   <baseUrl> must be the SAME base URL that generate-print-files.mjs was run
 *   with, and out/ must be a build made with NEXT_PUBLIC_SITE_URL pinned to it
 *   for the final run (unset locally, page src checks still apply).
 */
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { bundlePaths } from '../src/lib/bundle.mjs';
import { encodePath, viewerUrl } from '../src/lib/naming.mjs';
import { PLATE_TEMPLATES } from '../src/lib/plate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const printRoot = join(root, 'output', 'print');
const outRoot = join(root, 'out');

const baseUrl = process.argv[2];
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error('Usage: node scripts/audit-print-run.mjs <baseUrl>');
  process.exit(1);
}

const trees = JSON.parse(await readFile(join(root, 'src', 'data', 'trees.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'src', 'data', 'manifest.json'), 'utf8'));

const failures = [];
const fail = (msg) => failures.push(msg);

// ---- 1. survey <-> manifest ----
const surveyKeys = new Set(trees.map((t) => `${t.species}#${t.number}`));
const manifestKeys = new Set(manifest.map((e) => `${e.species}#${e.number}`));
if (manifest.length !== trees.length) fail(`manifest has ${manifest.length} entries, survey has ${trees.length}`);
for (const k of surveyKeys) if (!manifestKeys.has(k)) fail(`survey tree ${k} missing from manifest`);
const slugs = new Set(manifest.map((e) => e.slug));
if (slugs.size !== manifest.length) fail('duplicate slugs in manifest');

// ---- helpers ----
function decodePngBuffer(buf) {
  const png = PNG.sync.read(buf);
  const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return r?.data ?? null;
}

async function decodePlateQr(platePath, plate) {
  const img = await loadImage(platePath);
  if (img.width !== plate.width || img.height !== plate.height) {
    return { error: `wrong size ${img.width}x${img.height}` };
  }
  const { x, y, size } = plate.qrBox;
  const scale = 3; // upscale the crop so jsQR reads the 237px code reliably
  const canvas = createCanvas(size * scale, size * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, size, size, 0, 0, size * scale, size * scale);
  const data = ctx.getImageData(0, 0, size * scale, size * scale);
  const r = jsQR(new Uint8ClampedArray(data.data), size * scale, size * scale);

  // number band: white glyph pixels left of the QR box, level with it
  const bandCanvas = createCanvas(plate.width, plate.height);
  const bctx = bandCanvas.getContext('2d');
  bctx.drawImage(img, 0, 0);
  const band = bctx.getImageData(0, Math.round(plate.height * 0.17), plate.width, Math.round(plate.height * 0.32));
  let glyphMinX = null;
  let glyphMaxX = null;
  for (let py = 0; py < band.height; py += 2) {
    for (let px = Math.round(plate.width * 0.28); px < plate.qrBox.x + plate.qrBox.size; px += 2) {
      const i = (py * band.width + px) * 4;
      if (band.data[i] > 200 && band.data[i + 1] > 200 && band.data[i + 2] > 200) {
        if (px < plate.qrBox.x - 8) {
          // white left of the QR box = digit glyph
          if (glyphMinX === null || px < glyphMinX) glyphMinX = px;
          if (glyphMaxX === null || px > glyphMaxX) glyphMaxX = px;
        }
      }
    }
  }
  return { decoded: r?.data ?? null, glyphMinX, glyphMaxX };
}

// ---- 2..5 per-tree checks ----
let done = 0;
for (const entry of manifest) {
  const plate = PLATE_TEMPLATES[entry.species];
  const paths = bundlePaths(entry, Boolean(plate));
  const url = viewerUrl(baseUrl, entry.slug);

  // 2. standalone QR PNG
  const qrPath = join(printRoot, paths.qr);
  if (!existsSync(qrPath)) {
    fail(`${entry.name}: missing QR ${paths.qr}`);
  } else {
    const decoded = decodePngBuffer(await readFile(qrPath));
    if (decoded !== url) fail(`${entry.name}: QR decodes to "${decoded}", expected "${url}"`);
  }

  // 3. plate
  if (!plate) {
    fail(`${entry.name}: no plate template for species ${entry.species}`);
  } else {
    const platePath = join(printRoot, paths.plate);
    if (!existsSync(platePath)) {
      fail(`${entry.name}: missing plate ${paths.plate}`);
    } else {
      const r = await decodePlateQr(platePath, plate);
      if (r.error) fail(`${entry.name}: plate ${r.error}`);
      else {
        if (r.decoded !== url) fail(`${entry.name}: plate QR decodes to "${r.decoded}", expected "${url}"`);
        if (r.glyphMinX === null) fail(`${entry.name}: no digits found in the plate number band`);
        else if (r.glyphMaxX >= plate.qrBox.x - 10) fail(`${entry.name}: digits reach into the QR box (maxX ${r.glyphMaxX})`);
      }
    }
  }

  // 4. prerendered viewer page references exactly this tree's photo
  const pagePath = join(outRoot, 'view', `${entry.slug}.html`);
  if (!existsSync(pagePath)) {
    fail(`${entry.name}: missing page out/view/${entry.slug}.html`);
  } else {
    const html = await readFile(pagePath, 'utf8');
    const expectedSrc = `/images/${encodePath(entry.file)}`;
    if (!html.includes(`src="${expectedSrc}"`)) fail(`${entry.name}: page does not reference ${expectedSrc}`);
  }

  // 5. copied original image matches the source byte size
  const srcStat = await stat(join(root, 'public', 'images', entry.file));
  const copyPath = join(printRoot, paths.image);
  if (!existsSync(copyPath)) {
    fail(`${entry.name}: missing bundle image ${paths.image}`);
  } else {
    const copyStat = await stat(copyPath);
    if (copyStat.size !== srcStat.size) fail(`${entry.name}: bundle image size mismatch`);
  }

  done += 1;
  if (done % 200 === 0) console.log(`[audit] ${done}/${manifest.length}…`);
}

console.log(`\n[audit] checked ${done} trees against ${baseUrl}`);
if (failures.length > 0) {
  console.error(`[audit] ${failures.length} FAILURE(S):`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('[audit] PERFECT: every QR, plate, page, and image verified. Safe to print for this base URL.');
