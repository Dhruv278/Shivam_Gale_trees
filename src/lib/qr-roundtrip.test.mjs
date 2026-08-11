/**
 * Round-trip test for the printed artifact.
 *
 * Every other test in this project checks that our code ran. This one checks that the
 * *thing we print* is correct: it renders a real PNG with the production QR options and
 * decodes it back with an independent decoder (jsQR), pixel-in / string-out. If encoder
 * options, slug rules, or URL construction ever drift, a scan in the field returns the
 * wrong page - and by then the labels are already glued to physical products.
 */
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
// jsqr ships a UMD bundle whose `module.exports` *is* the function, so it arrives as the
// default import under Node's CJS-ESM interop. There is no working named export.
import jsQR from 'jsqr';
import { slugify, splitName, viewerUrl } from './naming.mjs';
import { QR_OPTIONS as PRODUCTION_QR_OPTIONS } from './qr.mjs';

/**
 * The print settings, written out literally so this file states what it is asserting.
 * The `matches production` test below pins it to the real exported constant - without
 * that pin, a duplicated literal would keep passing happily while production drifted
 * to different settings, which is the exact failure it looks like it is guarding.
 */
const QR_OPTIONS = { width: 512, margin: 2, errorCorrectionLevel: 'M' };

const BASE_URL = 'https://example.com';

/** Encode `text` to a PNG buffer, then decode that buffer back to text. */
async function roundTrip(text) {
  const buffer = await QRCode.toBuffer(text, { ...QR_OPTIONS, type: 'png' });
  expect(Buffer.isBuffer(buffer)).toBe(true);
  // PNG signature, so a failure below is a decode bug rather than "that wasn't a PNG".
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  const png = PNG.sync.read(buffer);
  expect(png.width).toBe(QR_OPTIONS.width);
  expect(png.height).toBe(QR_OPTIONS.width);

  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded, 'jsQR found no QR code in the generated PNG').not.toBeNull();
  return decoded.data;
}

describe('QR round-trip: generate a PNG, decode it, compare', () => {
  /**
   * Pins the literal above to the constant the portal actually generates with. If someone
   * raises error correction to 'Q' or drops the size, every round-trip assertion here would
   * otherwise keep passing against a stale copy while the printed codes changed.
   */
  it('exercises the same options production uses', () => {
    expect({ ...PRODUCTION_QR_OPTIONS }).toEqual(QR_OPTIONS);
  });

  it('decodes to the exact viewer URL', async () => {
    const url = viewerUrl(BASE_URL, 'aavla-sample');
    expect(url).toBe('https://example.com/view/aavla-sample');
    await expect(roundTrip(url)).resolves.toBe('https://example.com/view/aavla-sample');
  });

  it('round-trips a slug derived from a filename containing a space', async () => {
    const file = 'Fishtail plam.jpg';
    const slug = slugify(splitName(file).base);
    expect(slug).toBe('fishtail-plam');

    const url = viewerUrl(BASE_URL, slug);
    expect(url).toBe('https://example.com/view/fishtail-plam');
    // Exact: no stray %20, no leftover capitals, no truncation at the space.
    await expect(roundTrip(url)).resolves.toBe('https://example.com/view/fishtail-plam');
  });

  it('encodes only the viewer URL, never the underlying image path', async () => {
    const file = 'Fishtail plam.jpg';
    const decoded = await roundTrip(viewerUrl(BASE_URL, slugify(splitName(file).base)));

    // The QR must point at the viewer route. If it ever encoded /images/... directly, the
    // printed code would hard-link a storage path we can never re-point after printing.
    expect(decoded).toBe(`${BASE_URL}/view/fishtail-plam`);
    expect(decoded).not.toContain('/images/');
    expect(decoded).not.toContain('.jpg');
    expect(decoded).not.toContain(file);
    expect(decoded).not.toContain('Fishtail');
    expect(decoded).not.toContain('%20');
    expect(decoded).not.toContain(' ');
  });

  it('survives the longest slug in the real manifest', async () => {
    const { default: manifest } = await import('../data/manifest.json', { with: { type: 'json' } });
    const longest = manifest.reduce((a, b) => (b.slug.length > a.slug.length ? b : a));
    const url = viewerUrl(BASE_URL, longest.slug);
    await expect(roundTrip(url)).resolves.toBe(url);
  });
});
