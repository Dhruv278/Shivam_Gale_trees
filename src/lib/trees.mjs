/**
 * Per-tree identity, derived from the survey Excel.
 *
 * A tree's identity IS its Excel name: species + running number. "Aam -15" is
 * "Aam -15" forever, so treeSlug is deterministic and needs no allocation
 * state (unlike image files, whose slugs needed the slug-lock because
 * filenames get renamed). The build still guards against collisions with the
 * legacy lock (scripts/build-manifest.mjs).
 */
import { slugify } from './naming.mjs';

/** "Royal Palm -103" -> { species: 'Royal Palm', number: 103 }; null if not a tree name. */
export function parseTreeName(raw) {
  const match = /^(.*?)\s*-\s*(\d+)\s*$/.exec(String(raw ?? '').trim());
  if (!match || !match[1].trim()) return null;
  return { species: match[1].trim(), number: Number(match[2]) };
}

/** ('Aam', 1) -> 'aam-1' — the permanent viewer slug printed inside the QR. */
export function treeSlug(species, number) {
  return `${slugify(species)}-${number}`;
}

/** ('Aam', 1) -> 'Aam 1' — the human-facing name; also the bundle file base name. */
export function treeName(species, number) {
  return `${species} ${number}`;
}

/** "Aam -12" / "Aam 12" / "12" -> 12. Photo filenames only need to END in the tree number. */
export function extractPhotoNumber(baseName) {
  const match = /(\d+)\s*$/.exec(String(baseName).trim());
  return match ? Number(match[1]) : null;
}

/**
 * Photos present -> manifest entries, validated against the survey.
 *
 * The manifest is photo-driven by design: a tree appears (viewer page, QR,
 * plate) once its photo lands in public/images/<Species>/. The survey is the
 * validator - a photo for a tree the Excel does not know is a warning and is
 * skipped, never silently admitted or renumbered.
 */
export function buildTreeManifest(trees, photosBySpecies) {
  const maxBySpecies = new Map();
  for (const t of trees) {
    maxBySpecies.set(t.species, Math.max(maxBySpecies.get(t.species) ?? 0, t.number));
  }

  const entries = [];
  const warnings = [];
  for (const [species, byNumber] of Object.entries(photosBySpecies ?? {})) {
    const max = maxBySpecies.get(species);
    if (max === undefined) {
      warnings.push(
        `Folder "${species}" is not a species in the survey - skipped ${Object.keys(byNumber).length} photo(s).`,
      );
      continue;
    }
    for (const [numberKey, file] of Object.entries(byNumber)) {
      const number = Number(numberKey);
      if (!Number.isInteger(number) || number < 1 || number > max) {
        warnings.push(`Photo "${file}": ${species} has trees 1-${max} in the survey, got ${numberKey} - skipped.`);
        continue;
      }
      entries.push({
        species,
        number,
        slug: treeSlug(species, number),
        name: treeName(species, number),
        file,
        qrName: `${treeName(species, number)}.png`,
      });
    }
  }

  entries.sort((a, b) => (a.species < b.species ? -1 : a.species > b.species ? 1 : a.number - b.number));
  return { entries, warnings };
}
