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

/** A lock with nothing assigned yet, for the very first build. */
export const EMPTY_LOCK = { version: 1, assignments: {}, retired: {} };

/** Stable key order so the committed lock file produces clean git diffs. */
function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/**
 * Build manifest entries from a list of filenames, honouring a persisted lock.
 *
 * WHY THE LOCK EXISTS
 * -------------------
 * QR codes are printed on physical labels, so a slug must map to the same image
 * forever. Deriving slugs purely from the current file list does NOT give that:
 * add `Front B.jpg` alongside an existing `front-b.jpg` and both normalise to
 * `front-b`. Whichever sorts first wins, so the newcomer can take the slug and
 * push the incumbent to `front-b-2` - silently re-pointing an already-printed
 * code at a different poster. That is worse than a 404, because it is wrong
 * rather than absent.
 *
 * So assignments are recorded in a committed lock file and never recomputed:
 *
 *   - a file already in the lock keeps its slug and qrName, always;
 *   - only genuinely new files are assigned, deduped against every name ever
 *     handed out;
 *   - a removed file is moved to `retired`, and its slug stays reserved so it is
 *     never recycled onto a different image. An old QR then 404s, which is the
 *     honest outcome;
 *   - a retired file that comes back reclaims its original slug.
 *
 * @param {string[]} fileNames
 * @param {{version?: number, assignments?: object, retired?: object}} lock
 * @returns {{entries: Array, warnings: string[], lock: object}}
 */
export function buildManifest(fileNames, lock = EMPTY_LOCK) {
  const assignments = { ...(lock?.assignments ?? {}) };
  const retired = { ...(lock?.retired ?? {}) };

  const supported = fileNames.filter(isSupported).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const present = new Set(supported);
  const warnings = [];

  // Reserve every name ever issued - live AND retired - so nothing is recycled.
  const usedSlugs = new Set();
  const usedQrNames = new Set();
  for (const rec of [...Object.values(assignments), ...Object.values(retired)]) {
    usedSlugs.add(rec.slug.toLowerCase());
    usedQrNames.add(rec.qrName.toLowerCase());
  }

  // A file that was removed and has come back reclaims its original slug.
  for (const file of supported) {
    if (!assignments[file] && retired[file]) {
      assignments[file] = retired[file];
      delete retired[file];
      warnings.push(`Restored "${file}" to its original slug "${assignments[file].slug}".`);
    }
  }

  // Assign only files the lock has never seen.
  for (const file of supported) {
    if (assignments[file]) continue;
    const { base } = splitName(file);

    const slugWanted = slugify(base);
    const slug = dedupe(slugWanted, usedSlugs, (c, n) => `${c}-${n}`);
    if (slug !== slugWanted) {
      warnings.push(`Slug collision: "${file}" wanted "${slugWanted}", assigned "${slug}".`);
    }

    const qrWanted = `${base}.png`;
    const qrName = dedupe(qrWanted, usedQrNames, (c, n) => {
      const { base: b } = splitName(c);
      return `${b}-${n}.png`;
    });
    if (qrName !== qrWanted) {
      warnings.push(`QR filename collision: "${file}" wanted "${qrWanted}", assigned "${qrName}".`);
    }

    assignments[file] = { slug, qrName };
  }

  // Retire assignments whose file is gone. Their names stay reserved above.
  for (const file of Object.keys(assignments)) {
    if (present.has(file)) continue;
    retired[file] = assignments[file];
    delete assignments[file];
    warnings.push(
      `Retired "${file}" (no longer in the folder). Slug "${retired[file].slug}" stays reserved, ` +
        'so any printed code for it 404s rather than opening a different image.',
    );
  }

  const entries = supported.map((file) => ({
    file,
    slug: assignments[file].slug,
    qrName: assignments[file].qrName,
    name: splitName(file).base,
  }));

  return {
    entries,
    warnings,
    lock: { version: 1, assignments: sortKeys(assignments), retired: sortKeys(retired) },
  };
}

/** Absolute viewer URL encoded into a QR code. */
export function viewerUrl(baseUrl, slug) {
  return `${baseUrl.replace(/\/+$/, '')}/view/${slug}`;
}
