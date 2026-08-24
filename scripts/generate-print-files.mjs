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
const templates = new Map(); // species -> loaded template image
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
if (skipped.size > 0) {
  console.warn(`[print] no plates for: ${[...skipped].sort().join(', ')} (no template)`);
}
