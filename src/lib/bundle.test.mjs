import { describe, expect, test } from 'vitest';
import { bundlePaths } from './bundle.mjs';

describe('bundlePaths', () => {
  const entry = { species: 'Aam', name: 'Aam 1', file: 'Aam/IMG_1234 1.jpg' };

  test('same base name across the three folders, extension from the source image', () => {
    expect(bundlePaths(entry, true)).toEqual({
      image: 'Aam/images/Aam 1.jpg',
      qr: 'Aam/qr/Aam 1.png',
      qrSvg: 'Aam/qr/Aam 1.svg',
      qrDxf: 'Aam/qr/Aam 1.dxf',
      plate: 'Aam/plates/Aam 1.jpg',
    });
  });

  test('no plate path when the species has no template yet', () => {
    expect(bundlePaths(entry, false).plate).toBeNull();
  });

  // All QR formats are the same code for the same tree, so they must sit in the
  // same folder under the same basename and differ only in extension.
  test('the QR formats are siblings differing only in extension', () => {
    const { qr, qrSvg, qrDxf } = bundlePaths(entry, true);
    expect(qrSvg).toBe(qr.replace(/\.png$/, '.svg'));
    expect(qrDxf).toBe(qr.replace(/\.png$/, '.dxf'));
  });
});
