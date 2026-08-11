/**
 * Naming rules for the QR manager.
 *
 * Two distinct names are derived per image and must never be conflated:
 *
 *   slug   - the URL segment encoded into the QR code   ("Front Label.jpg" -> "front-label")
 *   qrName - the filename of the QR PNG inside the ZIP  ("Front Label.jpg" -> "Front Label.png")
 *
 * `qrName` preserves the original basename verbatim, because the requirement is that a
 * QR image is named after the real image. `slug` is normalised so URLs stay clean and
 * survive the case-insensitivity of scanners and hand-typed links.
 *
 * This module is `.mjs` so the build script and the app share one source of truth
 * (package.json has no "type": "module", so a plain .js file would be CJS to Node).
 */

/** Extensions we ingest. Adding a type here is the only change needed to support it. */
export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Fallback slug for names that normalise away entirely (e.g. "___.jpg"). */
const SLUG_FALLBACK = 'image';

/** Split "Front Label.jpg" into { base: "Front Label", ext: ".jpg" }. */
export function splitName(fileName) {
  const dot = fileName.lastIndexOf('.');
  // dot <= 0 covers both "noext" and dotfiles like ".gitkeep", which have no real basename.
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

export function isSupported(fileName) {
  const { ext } = splitName(fileName);
  return SUPPORTED_EXTENSIONS.includes(ext.toLowerCase());
}

/** "Aavla Sample" -> "aavla-sample". Strips accents so URLs stay ASCII. */
export function slugify(base) {
  const slug = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || SLUG_FALLBACK;
}

/**
 * Append -2, -3, ... until `candidate` is unused. Comparison is case-insensitive
 * because ZIP entries extracted on Windows/macOS collide on case, which would
 * silently drop QR codes from a print run.
 */
function dedupe(candidate, taken, suffixTarget) {
  const key = (s) => s.toLowerCase();
  if (!taken.has(key(candidate))) {
    taken.add(key(candidate));
    return candidate;
  }
  for (let n = 2; ; n += 1) {
    const next = suffixTarget(candidate, n);
    if (!taken.has(key(next))) {
      taken.add(key(next));
      return next;
    }
  }
}

/**
 * Build manifest entries from a list of filenames.
 *
 * Files are sorted first so collision suffixes are deterministic across builds -
 * otherwise filesystem ordering could reshuffle which image owns "front-label"
 * between deploys, invalidating already-printed QR codes.
 *
 * @param {string[]} fileNames
 * @returns {{entries: Array, warnings: string[]}}
 */
export function buildManifest(fileNames) {
  const supported = fileNames.filter(isSupported).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const usedSlugs = new Set();
  const usedQrNames = new Set();
  const warnings = [];
  const entries = [];

  for (const file of supported) {
    const { base } = splitName(file);

    const slugWanted = slugify(base);
    const slug = dedupe(slugWanted, usedSlugs, (c, n) => `${c}-${n}`);
    if (slug !== slugWanted) {
      warnings.push(`Slug collision: "${file}" wanted "${slugWanted}", using "${slug}".`);
    }

    const qrWanted = `${base}.png`;
    const qrName = dedupe(qrWanted, usedQrNames, (c, n) => {
      const { base: b } = splitName(c);
      return `${b}-${n}.png`;
    });
    if (qrName !== qrWanted) {
      warnings.push(`QR filename collision: "${file}" wanted "${qrWanted}", using "${qrName}".`);
    }

    entries.push({ file, slug, qrName, name: base });
  }

  return { entries, warnings };
}

/** Absolute viewer URL encoded into a QR code. */
export function viewerUrl(baseUrl, slug) {
  return `${baseUrl.replace(/\/+$/, '')}/view/${slug}`;
}
