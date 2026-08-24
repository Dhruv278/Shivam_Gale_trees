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
