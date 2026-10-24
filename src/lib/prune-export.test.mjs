import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { pruneViewPayloads } from './prune-export.mjs';

// Mirrors what `next build` (output: 'export') writes for one viewer page.
const PAGE_FILES = (slug) => [
  `view/${slug}.html`,
  `view/${slug}.txt`,
  `view/${slug}/__next._full.txt`,
  `view/${slug}/__next._tree.txt`,
  `view/${slug}/__next.view/$d$slug/__PAGE__.txt`,
];

describe('pruneViewPayloads', () => {
  let out;

  async function touch(rel) {
    await mkdir(dirname(join(out, rel)), { recursive: true });
    await writeFile(join(out, rel), 'x');
  }

  beforeEach(async () => {
    out = await mkdtemp(join(tmpdir(), 'prune-export-'));
  });

  afterEach(async () => {
    await rm(out, { recursive: true, force: true });
  });

  test('removes the navigation payloads and keeps every viewer page', async () => {
    for (const slug of ['aam-1', 'aam-2']) for (const f of PAGE_FILES(slug)) await touch(f);

    const result = await pruneViewPayloads(out);

    expect(result).toEqual({ pages: 2, removed: 8 });
    expect(existsSync(join(out, 'view/aam-1.html'))).toBe(true);
    expect(existsSync(join(out, 'view/aam-2.html'))).toBe(true);
    expect(existsSync(join(out, 'view/aam-1.txt'))).toBe(false);
    expect(existsSync(join(out, 'view/aam-1'))).toBe(false);
  });

  // The portal and /plate pages are outside view/ and are left exactly as built.
  test('does not touch anything outside view/', async () => {
    for (const f of PAGE_FILES('aam-1')) await touch(f);
    await touch('index.txt');
    await touch('__next._tree.txt');

    await pruneViewPayloads(out);

    expect(existsSync(join(out, 'index.txt'))).toBe(true);
    expect(existsSync(join(out, '__next._tree.txt'))).toBe(true);
  });

  // An unexpected file means the export layout changed; deleting blind could take
  // out something a printed QR code depends on, so nothing is removed at all.
  test('aborts without deleting anything when a page folder holds a non-payload file', async () => {
    for (const f of PAGE_FILES('aam-1')) await touch(f);
    await touch('view/aam-1/index.html');

    await expect(pruneViewPayloads(out)).rejects.toThrow(/view\/aam-1\/index\.html/);
    expect(existsSync(join(out, 'view/aam-1.txt'))).toBe(true);
    expect(existsSync(join(out, 'view/aam-1/__next._tree.txt'))).toBe(true);
  });

  test('aborts when a payload has no matching viewer page', async () => {
    await touch('view/aam-1.txt');

    await expect(pruneViewPayloads(out)).rejects.toThrow(/aam-1/);
    expect(existsSync(join(out, 'view/aam-1.txt'))).toBe(true);
  });
});
