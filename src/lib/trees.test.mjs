import { describe, expect, test } from 'vitest';
import { parseTreeName, treeName, treeSlug } from './trees.mjs';

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
