/**
 * Round-trip test for the SVG printed artifact, the sibling of qr-roundtrip.test.mjs.
 *
 * Vector output is the format a printer can scale without resampling, so it is the
 * one most likely to be sent straight to plate film. A malformed path or a wrong
 * viewBox would still *look* like a QR code in a viewer while decoding to nothing —
 * so this renders the real SVG, rasterises it, and decodes it with an independent
 * decoder (jsQR), markup-in / string-out.
 *
 * It also pins the SVG and the PNG to the same URL: two formats of the same tree's
 * code that disagreed would be worse than either being absent.
 */
import { describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// jsqr ships a UMD bundle whose `module.exports` *is* the function, so it arrives as the
// default import under Node's CJS-ESM interop. There is no working named export.
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { slugify, splitName, viewerUrl } from './naming.mjs';
import { QR_OPTIONS, generateQrSvg } from './qr.mjs';

const BASE_URL = 'https://example.com';

/** Rasterise QR SVG markup onto a white canvas and decode it back to text. */
async function decodeSvg(svg, size = QR_OPTIONS.width) {
  const image = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // The SVG's own quiet zone is transparent, not white: without this fill the
  // margin rasterises to black RGBA(0,0,0,0) and jsQR loses the finder pattern.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size);
  const decoded = jsQR(new Uint8ClampedArray(data.data), size, size);
  expect(decoded, 'jsQR found no QR code in the rasterised SVG').not.toBeNull();
  return decoded.data;
}

describe('QR SVG round-trip: generate markup, rasterise it, decode', () => {
  it('produces real SVG markup, not a data URL', async () => {
    const svg = await generateQrSvg(BASE_URL, 'aam-72');
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).not.toContain('data:image');
  });

  it('decodes to the exact viewer URL', async () => {
    const svg = await generateQrSvg(BASE_URL, 'aam-72');
    await expect(decodeSvg(svg)).resolves.toBe('https://example.com/view/aam-72');
  });

  /**
   * The whole point of the vector format: the same markup must decode after being
   * rasterised at a size other than the one it was authored at, because a printer
   * will scale it to the plate.
   */
  it('still decodes when rasterised at a different size', async () => {
    const svg = await generateQrSvg(BASE_URL, 'aam-72');
    await expect(decodeSvg(svg, 256)).resolves.toBe('https://example.com/view/aam-72');
    await expect(decodeSvg(svg, 1024)).resolves.toBe('https://example.com/view/aam-72');
  });

  it('agrees with the PNG for the same tree', async () => {
    const url = viewerUrl(BASE_URL, 'aam-72');

    const png = PNG.sync.read(await QRCode.toBuffer(url, { ...QR_OPTIONS }));
    const fromPng = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    const fromSvg = await decodeSvg(await generateQrSvg(BASE_URL, 'aam-72'));

    expect(fromSvg).toBe(fromPng.data);
    expect(fromSvg).toBe(url);
  });

  it('encodes only the viewer URL, never the underlying image path', async () => {
    const slug = slugify(splitName('Fishtail plam.jpg').base);
    const decoded = await decodeSvg(await generateQrSvg(BASE_URL, slug));

    expect(decoded).toBe(`${BASE_URL}/view/fishtail-plam`);
    expect(decoded).not.toContain('/images/');
    expect(decoded).not.toContain('.jpg');
    expect(decoded).not.toContain('%20');
    expect(decoded).not.toContain(' ');
  });

  it('survives the longest slug in the real manifest', async () => {
    const { default: manifest } = await import('../data/manifest.json', { with: { type: 'json' } });
    const longest = manifest.reduce((a, b) => (b.slug.length > a.slug.length ? b : a));
    const svg = await generateQrSvg(BASE_URL, longest.slug);
    await expect(decodeSvg(svg)).resolves.toBe(viewerUrl(BASE_URL, longest.slug));
  });
});
