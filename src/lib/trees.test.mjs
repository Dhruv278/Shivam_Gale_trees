import { describe, expect, test } from 'vitest';
import {
  buildTreeManifest,
  extractPhotoNumber,
  parseTreeName,
  treeName,
  treeSlug,
} from './trees.mjs';

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
