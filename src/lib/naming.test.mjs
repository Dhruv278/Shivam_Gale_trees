import { describe, expect, it } from 'vitest';
import { buildManifest, isSupported, slugify, splitName, viewerUrl } from './naming.mjs';

describe('splitName', () => {
  it('splits basename from extension', () => {
    expect(splitName('Front Label.jpg')).toEqual({ base: 'Front Label', ext: '.jpg' });
  });

  it('handles names containing dots', () => {
    expect(splitName('Badam -01.v2.jpg')).toEqual({ base: 'Badam -01.v2', ext: '.jpg' });
  });

  it('treats dotfiles as having no extension', () => {
    expect(splitName('.gitkeep')).toEqual({ base: '.gitkeep', ext: '' });
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Aavla Sample')).toBe('aavla-sample');
  });

  // Guards the combining-diacritics character class: a broken range would eat digits.
  it('preserves digits', () => {
    expect(slugify('Badam -01')).toBe('badam-01');
    expect(slugify('Bakul-01')).toBe('bakul-01');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Niño')).toBe('cafe-nino');
  });

  it('collapses runs of separators and trims edges', () => {
    expect(slugify('  Fishtail   plam!! ')).toBe('fishtail-plam');
  });

  it('falls back when a name normalises away entirely', () => {
    expect(slugify('___')).toBe('image');
  });
});

describe('isSupported', () => {
  it('accepts image types case-insensitively', () => {
    expect(isSupported('a.JPG')).toBe(true);
    expect(isSupported('a.webp')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isSupported('notes.txt')).toBe(false);
    expect(isSupported('Manual.pdf')).toBe(false);
  });
});

describe('buildManifest', () => {
  it('derives slug and qrName, preserving the original basename for the QR file', () => {
    const { entries } = buildManifest(['Fishtail plam.jpg']);
    expect(entries).toEqual([
      { file: 'Fishtail plam.jpg', slug: 'fishtail-plam', qrName: 'Fishtail plam.png', name: 'Fishtail plam' },
    ]);
  });

  it('ignores unsupported files', () => {
    const { entries } = buildManifest(['a.jpg', 'readme.txt', 'Manual.pdf']);
    expect(entries.map((e) => e.file)).toEqual(['a.jpg']);
  });

  it('is deterministic regardless of input order', () => {
    const a = buildManifest(['b.jpg', 'a.jpg', 'c.jpg']);
    const b = buildManifest(['c.jpg', 'b.jpg', 'a.jpg']);
    expect(a.entries).toEqual(b.entries);
  });

  it('suffixes colliding slugs and reports a warning', () => {
    const { entries, warnings } = buildManifest(['A B.jpg', 'a-b.jpg']);
    const slugs = entries.map((e) => e.slug);
    expect(slugs).toContain('a-b');
    expect(slugs).toContain('a-b-2');
    expect(new Set(slugs).size).toBe(2);
    expect(warnings.some((w) => w.includes('Slug collision'))).toBe(true);
  });

  it('suffixes colliding QR filenames keeping the .png extension last', () => {
    const { entries, warnings } = buildManifest(['Front.jpg', 'Front.png']);
    const qrNames = entries.map((e) => e.qrName);
    expect(qrNames).toEqual(['Front.png', 'Front-2.png']);
    expect(warnings.some((w) => w.includes('QR filename collision'))).toBe(true);
  });

  // Extracting a ZIP on Windows/macOS collapses case, which would silently lose a QR code.
  it('treats QR filenames as case-insensitive when deduping', () => {
    const { entries } = buildManifest(['Front.jpg', 'front.webp']);
    const lowered = entries.map((e) => e.qrName.toLowerCase());
    expect(new Set(lowered).size).toBe(2);
  });

  it('produces no warnings for a clean set', () => {
    const { warnings } = buildManifest(['Amaltas.jpg', 'Bargad.jpg', 'Chiku.jpg']);
    expect(warnings).toEqual([]);
  });
});

describe('viewerUrl', () => {
  it('joins base and slug', () => {
    expect(viewerUrl('https://x.vercel.app', 'amaltas')).toBe('https://x.vercel.app/view/amaltas');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(viewerUrl('https://x.vercel.app/', 'amaltas')).toBe('https://x.vercel.app/view/amaltas');
  });
});
