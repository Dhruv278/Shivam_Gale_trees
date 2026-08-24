/**
 * Tree plate composition.
 *
 * A plate is the designer's template image (blue oval, rings, Hindi species
 * name — all untouched) with exactly two things stamped on top: the tree's
 * number and its QR code. Drawing is orchestrated here against an injected
 * canvas context so the geometry and layer order are unit-testable without a
 * DOM, in the same spirit as qr.mjs.
 *
 * All coordinates are pixels of the template at its natural size and were
 * measured from the artwork (see docs/plate-plan.html). The physical plate is
 * 5.5in x 4.5in, which the 1600x1309 template matches at ~291 DPI.
 */

/**
 * One config object per delivered species template artwork.
 *
 *   qrBox  - the empty square printed on the template; the QR PNG (which
 *            carries its own white quiet zone) is drawn to fill it exactly.
 *   number - the digit band sits level with the QR box on the sample plate:
 *            glyph box y 304..535 (center 420), center x 733 — all raw pixel
 *            measurements. fontSize 349 renders the digits at the sample's
 *            ~231px glyph height (verified by pixel-measuring real output).
 */
export const PLATE_TEMPLATES = Object.freeze({
  Aam: Object.freeze({
    species: 'Aam',
    template: '/plates/aam.jpg',
    width: 1600,
    height: 1309,
    qrBox: Object.freeze({ x: 1027, y: 304, size: 229 }),
    number: Object.freeze({ centerX: 733, centerY: 420, fontSize: 349 }),
  }),
});

/** Template for a species, or null while its artwork has not been delivered yet. */
export function getPlateTemplate(species) {
  return PLATE_TEMPLATES[species] ?? null;
}

/** "Aam", 1 -> "Aam-1-plate.jpg" — the name the downloaded JPG is saved under. */
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

  ctx.font = `${plate.number.fontSize}px Stencil, serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // Engines disagree on where 'middle'/'top' baselines sit for the same font
  // (Chrome vs @napi-rs/canvas differ by ~90px here), so never trust them:
  // measure the actual glyph box and center IT on the configured point.
  ctx.textBaseline = 'alphabetic';
  const text = String(number);
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent ?? 0;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const baselineY = plate.number.centerY + (ascent - descent) / 2;
  ctx.fillText(text, plate.number.centerX, baselineY);
}
