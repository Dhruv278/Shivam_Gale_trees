/**
 * Tree plate composition.
 *
 * A plate is the designer's template image (blue oval, rings, Hindi species
 * name — all untouched) with exactly two things stamped on top: the tree's
 * number and its QR code. Drawing is orchestrated here against an injected
 * canvas context so the geometry and layer order are unit-testable without a
 * DOM, in the same spirit as qr.mjs.
 *
 * All 45 delivered templates are the same artwork at 1651x1351 px (5.5in x
 * 4.5in at ~300 DPI) with the QR placeholder square at an identical position
 * (measured across every file; the ±1px spread is JPEG noise), so one shared
 * layout drives every species.
 *
 *   qrBox  - the empty square printed on the template; the QR PNG (which
 *            carries its own white quiet zone) is drawn to fill it exactly.
 *   number - the digit band sits level with the QR box. centerX/centerY are
 *            the sample plate's measured glyph center scaled to the new
 *            template resolution; fontSize renders single digits at the
 *            sample's glyph height; maxWidth caps multi-digit numbers so they
 *            can never run into the QR box (drawPlate shrinks to fit).
 */
import { slugify } from './naming.mjs';

/** Every species in the survey, Excel spelling. Template files are /plates/<slug>.jpg. */
const SPECIES = [
  'Aam', 'Aavla', 'Agastya', 'Amaltas', 'Amrud', 'Ashok', 'Babul', 'Badam', 'Bael',
  'Bakul', 'Bargad', 'Ber', 'Champa', 'Cheel', 'Chiku', 'Christmas', 'Fishtail Palm',
  'Gular', 'Gulmohur', 'Imli', 'Jamun', 'Jarul', 'Kadamb', 'Khajur', 'Khirni',
  'Lasora', 'Mahogani', 'Nariyal', 'Neem', 'Nilgiri', 'Nimbu', 'Peepal',
  'Ponytail palm', 'Pukar', 'Putrajiv', 'Royal Palm', 'Rubber', 'Saag', 'Saal',
  'Saptaparni', 'Saru', 'Subabul', 'Taad', 'Travellers palm', 'Vasantrani',
];

const WIDTH = 1651;
const HEIGHT = 1351;
const QR_BOX = Object.freeze({ x: 1058, y: 314, size: 237 });
const NUMBER = Object.freeze({ centerX: 756, centerY: 433, fontSize: 361, maxWidth: 560 });

export const PLATE_TEMPLATES = Object.freeze(
  Object.fromEntries(
    SPECIES.map((species) => [
      species,
      Object.freeze({
        species,
        template: `/plates/${slugify(species)}.jpg`,
        width: WIDTH,
        height: HEIGHT,
        qrBox: QR_BOX,
        number: NUMBER,
      }),
    ]),
  ),
);

/** Template for a species, or null for names outside the survey. */
export function getPlateTemplate(species) {
  return PLATE_TEMPLATES[species] ?? null;
}

/** "Aam", 1 -> "Aam-1-plate.jpg" — the name a single downloaded plate is saved under. */
export function plateFileName(species, number) {
  return `${species}-${number}-plate.jpg`;
}

/**
 * Compose one plate onto a 2D context sized plate.width x plate.height.
 * Layer order is the contract: template first (bottom), then QR, then number.
 */
export function drawPlate(ctx, { templateImage, qrImage, number, plate }) {
  ctx.drawImage(templateImage, 0, 0, plate.width, plate.height);

  const { qrBox } = plate;
  ctx.drawImage(qrImage, qrBox.x, qrBox.y, qrBox.size, qrBox.size);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // Engines disagree on where 'middle'/'top' baselines sit for the same font
  // (Chrome vs @napi-rs/canvas differ by ~90px here), so never trust them:
  // measure the actual glyph box and center IT on the configured point.
  ctx.textBaseline = 'alphabetic';

  const text = String(number);
  let fontSize = plate.number.fontSize;
  ctx.font = `${fontSize}px Stencil, serif`;
  let metrics = ctx.measureText(text);

  // Multi-digit numbers must never run into the QR box: shrink to the band.
  const { maxWidth } = plate.number;
  if (maxWidth && metrics.width > maxWidth) {
    fontSize = Math.floor((fontSize * maxWidth) / metrics.width);
    ctx.font = `${fontSize}px Stencil, serif`;
    metrics = ctx.measureText(text);
  }

  const ascent = metrics.actualBoundingBoxAscent ?? 0;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const baselineY = plate.number.centerY + (ascent - descent) / 2;
  ctx.fillText(text, plate.number.centerX, baselineY);
}
