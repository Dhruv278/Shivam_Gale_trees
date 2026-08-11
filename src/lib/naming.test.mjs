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

/**
 * These are the tests that protect the printed artifact. Once a QR code is on a
 * physical label its URL cannot be changed, so a slug must never move to a
 * different image no matter what is added to or removed from the folder.
 */
describe('slug stability across rebuilds (the lock)', () => {
  const slugOf = (result, file) => result.entries.find((e) => e.file === file)?.slug;

  it('keeps existing slugs when unrelated files are added', () => {
    const first = buildManifest(['Amaltas.jpg', 'Bargad.jpg']);
    const second = buildManifest(['Amaltas.jpg', 'Bargad.jpg', 'Chiku.jpg', 'Neem.jpg'], first.lock);

    expect(slugOf(second, 'Amaltas.jpg')).toBe(slugOf(first, 'Amaltas.jpg'));
    expect(slugOf(second, 'Bargad.jpg')).toBe(slugOf(first, 'Bargad.jpg'));
    expect(slugOf(second, 'Chiku.jpg')).toBe('chiku');
  });

  // The regression this whole mechanism exists for. Without the lock the newcomer
  // sorts first, steals "front-b", and the printed code opens the wrong poster.
  it('does NOT let a newly added colliding file steal an assigned slug', () => {
    const first = buildManifest(['front-b.jpg']);
    expect(slugOf(first, 'front-b.jpg')).toBe('front-b');

    const second = buildManifest(['front-b.jpg', 'Front B.jpg'], first.lock);
    expect(slugOf(second, 'front-b.jpg')).toBe('front-b');
    expect(slugOf(second, 'Front B.jpg')).toBe('front-b-2');
  });

  it('holds slugs stable across many incremental additions', () => {
    let lock = undefined;
    const seen = new Map();
    const batches = [
      ['Aavla Sample.jpg'],
      ['Aavla Sample.jpg', 'aavla sample.png'],
      ['Aavla Sample.jpg', 'aavla sample.png', 'AAVLA-SAMPLE.webp'],
    ];
    for (const files of batches) {
      const result = buildManifest(files, lock);
      lock = result.lock;
      for (const entry of result.entries) {
        if (seen.has(entry.file)) expect(entry.slug).toBe(seen.get(entry.file));
        else seen.set(entry.file, entry.slug);
      }
    }
    expect(new Set(seen.values()).size).toBe(3);
    expect(seen.get('Aavla Sample.jpg')).toBe('aavla-sample');
  });

  it('retires a removed file and never recycles its slug onto another image', () => {
    const first = buildManifest(['front-b.jpg']);
    const removed = buildManifest([], first.lock);

    expect(removed.entries).toEqual([]);
    expect(removed.lock.retired['front-b.jpg'].slug).toBe('front-b');

    // A different image that wants the same slug must not inherit it.
    const later = buildManifest(['Front B.jpg'], removed.lock);
    expect(slugOf(later, 'Front B.jpg')).toBe('front-b-2');
  });

  it('gives a returning file its original slug back', () => {
    const first = buildManifest(['Amaltas.jpg', 'Bargad.jpg']);
    const gone = buildManifest(['Amaltas.jpg'], first.lock);
    const back = buildManifest(['Amaltas.jpg', 'Bargad.jpg'], gone.lock);

    expect(slugOf(back, 'Bargad.jpg')).toBe(slugOf(first, 'Bargad.jpg'));
    expect(back.lock.retired['Bargad.jpg']).toBeUndefined();
  });

  it('keeps qrName stable too, so downloaded filenames do not shuffle', () => {
    const first = buildManifest(['Front.jpg']);
    const second = buildManifest(['Front.jpg', 'front.webp'], first.lock);
    const qrOf = (r, f) => r.entries.find((e) => e.file === f)?.qrName;

    expect(qrOf(second, 'Front.jpg')).toBe(qrOf(first, 'Front.jpg'));
    expect(qrOf(second, 'front.webp')).not.toBe(qrOf(first, 'Front.jpg'));
  });

  it('is idempotent: rebuilding with no changes rewrites an identical lock', () => {
    const first = buildManifest(['Amaltas.jpg', 'Bargad.jpg', 'Chiku.jpg']);
    const second = buildManifest(['Amaltas.jpg', 'Bargad.jpg', 'Chiku.jpg'], first.lock);

    expect(second.lock).toEqual(first.lock);
    expect(second.entries).toEqual(first.entries);
    expect(second.warnings).toEqual([]);
  });

  it('warns when a slug is retired so the operator sees it', () => {
    const first = buildManifest(['Amaltas.jpg']);
    const gone = buildManifest([], first.lock);
    expect(gone.warnings.some((w) => w.includes('Retired') && w.includes('amaltas'))).toBe(true);
  });
});
