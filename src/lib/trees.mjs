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
