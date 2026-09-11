/**
 * Round-trip test for the DXF printed artifact, the third sibling after the PNG and
 * SVG round-trips.
 *
 * A DXF is geometry, not pixels: nothing about it is "black" until a laser or CAD
 * tool fills the closed shapes. So this parses the real file back, fills it the way
 * such tools do, and decodes the result with an independent decoder (jsQR) - with
 * inversion attempts DISABLED. The shop's own converted sample only decodes when
 * inverted, because a stray frame around the drawing flips every module; a laser
 * would have marked the negative. Decoding non-inverted is the assertion that ours
 * would not.
 */
import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
// jsqr ships a UMD bundle whose `module.exports` *is* the function, so it arrives as the
// default import under Node's CJS-ESM interop. There is no working named export.
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { drawDxf, parseDxf } from './dxf.mjs';
import { slugify, splitName, viewerUrl } from './naming.mjs';
import { QR_OPTIONS, generateQrDxf } from './qr.mjs';

const BASE_URL = 'https://example.com';

/** Fill the parsed geometry at `px` pixels and return the canvas. */
function rasterise(dxfText, px, fillRule = 'evenodd') {
  const dxf = parseDxf(dxfText);
  const canvas = createCanvas(px, px);
  drawDxf(canvas.getContext('2d'), dxf, px, fillRule);
  return canvas;
}

/** Decode strictly: a code that only reads when inverted is a failure here. */
function decodeCanvas(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height);
  const decoded = jsQR(new Uint8ClampedArray(data.data), width, height, {
    inversionAttempts: 'dontInvert',
  });
  expect(decoded, 'jsQR found no non-inverted QR code in the filled DXF').not.toBeNull();
  return decoded.data;
}

const decodeDxf = (dxfText, px = QR_OPTIONS.width, fillRule) =>
  decodeCanvas(rasterise(dxfText, px, fillRule));

describe('QR DXF round-trip: write geometry, fill it, decode', () => {
  it('produces an R12 DXF sized like the PNG and SVG', async () => {
    const dxf = await generateQrDxf(BASE_URL, 'aam-72');
    const parsed = parseDxf(dxf);
    expect(parsed.version).toBe('AC1009');
    expect(parsed.extents).toEqual({ x: QR_OPTIONS.width, y: QR_OPTIONS.width });
    expect(parsed.loops.length).toBeGreaterThan(10);
  });

  it('decodes to the exact viewer URL without inversion', async () => {
    const dxf = await generateQrDxf(BASE_URL, 'aam-72');
    expect(decodeDxf(dxf)).toBe('https://example.com/view/aam-72');
  });

  it('decodes under the non-zero winding rule as well as even-odd', async () => {
    // Hole loops must be wound opposite to their outer loop for this to pass.
    const dxf = await generateQrDxf(BASE_URL, 'aam-72');
    expect(decodeDxf(dxf, QR_OPTIONS.width, 'nonzero')).toBe('https://example.com/view/aam-72');
  });

  it('still decodes when the shop rescales it', async () => {
    const dxf = await generateQrDxf(BASE_URL, 'aam-72');
    expect(decodeDxf(dxf, 256)).toBe('https://example.com/view/aam-72');
    expect(decodeDxf(dxf, 1024)).toBe('https://example.com/view/aam-72');
  });

  /**
   * Stronger than "both decode to the same URL": the DXF must be the SAME symbol as
   * the PNG - same version, same mask - so every module agrees. Sampled at module
   * centres because the 512 px PNG has a non-integer module size.
   */
  it('is module-for-module identical to the PNG', async () => {
    const url = viewerUrl(BASE_URL, 'aam-72');
    const { modules } = QRCode.create(url, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
    const png = PNG.sync.read(await QRCode.toBuffer(url, { ...QR_OPTIONS }));
    const dxfCanvas = rasterise(await generateQrDxf(BASE_URL, 'aam-72'), QR_OPTIONS.width);
    const dxfPixels = dxfCanvas.getContext('2d').getImageData(0, 0, png.width, png.height).data;

    const unit = QR_OPTIONS.width / (modules.size + 2 * QR_OPTIONS.margin);
    let compared = 0;
    for (let r = 0; r < modules.size; r += 1) {
      for (let c = 0; c < modules.size; c += 1) {
        const x = Math.floor((c + QR_OPTIONS.margin + 0.5) * unit);
        const y = Math.floor((r + QR_OPTIONS.margin + 0.5) * unit);
        const i = (y * png.width + x) * 4;
        const pngDark = png.data[i] < 128;
        const dxfDark = dxfPixels[i] < 128;
        expect(dxfDark, `module (${r},${c}) differs between PNG and DXF`).toBe(pngDark);
        compared += 1;
      }
    }
    expect(compared).toBe(modules.size * modules.size);
  });

  it('encodes only the viewer URL, never the underlying image path', async () => {
    const slug = slugify(splitName('Fishtail plam.jpg').base);
    const decoded = decodeDxf(await generateQrDxf(BASE_URL, slug));
    expect(decoded).toBe(`${BASE_URL}/view/fishtail-plam`);
    expect(decoded).not.toContain('/images/');
    expect(decoded).not.toContain('.jpg');
    expect(decoded).not.toContain(' ');
  });

  it('survives the longest slug in the real manifest', async () => {
    const { default: manifest } = await import('../data/manifest.json', { with: { type: 'json' } });
    const longest = manifest.reduce((a, b) => (b.slug.length > a.slug.length ? b : a));
    const dxf = await generateQrDxf(BASE_URL, longest.slug);
    expect(decodeDxf(dxf)).toBe(viewerUrl(BASE_URL, longest.slug));
  });
});
