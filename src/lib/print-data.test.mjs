/**
 * Print-data invariants. These guard the COMMITTED data (trees.json,
 * manifest.json, template files) — the things a printed plate depends on.
 * If any of these fail, do not print.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import manifest from '../data/manifest.json';
import lock from '../data/slug-lock.json';
import trees from '../data/trees.json';
import { PLATE_TEMPLATES } from './plate.mjs';
import { treeSlug } from './trees.mjs';

const pub = (...p) => join(process.cwd(), 'public', ...p);

describe('survey data (trees.json)', () => {
  test('has exactly 1777 trees across 45 species', () => {
    expect(trees).toHaveLength(1777);
    expect(new Set(trees.map((t) => t.species)).size).toBe(45);
  });

  test('every (species, number) is unique', () => {
    const keys = new Set(trees.map((t) => `${t.species}#${t.number}`));
    expect(keys.size).toBe(trees.length);
  });
});

describe('manifest (what gets printed)', () => {
  test('covers every survey tree exactly once', () => {
    expect(manifest).toHaveLength(trees.length);
    const surveyKeys = new Set(trees.map((t) => `${t.species}#${t.number}`));
    for (const e of manifest) expect(surveyKeys.has(`${e.species}#${e.number}`)).toBe(true);
  });

  test('slugs are unique, deterministic, and never collide with the legacy lock', () => {
    const slugs = new Set(manifest.map((e) => e.slug));
    expect(slugs.size).toBe(manifest.length);
    for (const e of manifest) expect(e.slug).toBe(treeSlug(e.species, e.number));
    const legacy = new Set(
      [...Object.values(lock.assignments ?? {}), ...Object.values(lock.retired ?? {})].map((r) => r.slug),
    );
    for (const e of manifest) expect(legacy.has(e.slug)).toBe(false);
  });

  // 1,777 stat calls legitimately take a while when the disk is busy.
  test('every photo file referenced by the manifest exists', { timeout: 60000 }, () => {
    const missing = manifest.filter((e) => !existsSync(pub('images', e.file)));
    expect(missing.map((e) => e.file)).toEqual([]);
  });
});

describe('plate templates', () => {
  test('every species has a registered template whose artwork file exists', () => {
    const species = [...new Set(trees.map((t) => t.species))];
    const missing = species.filter(
      (s) => !PLATE_TEMPLATES[s] || !existsSync(pub(PLATE_TEMPLATES[s].template.replace(/^\//, ''))),
    );
    expect(missing).toEqual([]);
  });
});
