'use client';

import { useMemo, useState } from 'react';
import SpeciesSection from '@/components/SpeciesSection';

/**
 * Species-sectioned catalogue. DOM cost is bounded by sections being
 * collapsed by default (a closed <details> renders no rows) plus native
 * lazy-loading of the 44px thumbnails inside an opened one.
 */
export default function ImageList({ entries, baseUrl }) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? entries.filter(
          (e) => e.name.toLowerCase().includes(needle) || e.species.toLowerCase().includes(needle),
        )
      : entries;
    const bySpecies = new Map();
    for (const entry of filtered) {
      if (!bySpecies.has(entry.species)) bySpecies.set(entry.species, []);
      bySpecies.get(entry.species).push(entry);
    }
    return [...bySpecies.entries()]; // manifest is already (species, number) sorted
  }, [entries, query]);

  const shown = sections.reduce((a, [, list]) => a + list.length, 0);

  return (
    <section aria-labelledby="images-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="images-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {entries.length} {entries.length === 1 ? 'tree' : 'trees'} · {sections.length} species
          </h2>
          {query && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{shown} matching</p>}
        </div>
        <label className="w-full sm:w-72">
          <span className="sr-only">Search trees</span>
          <input
            type="search"
            id="image-search"
            name="image-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tree or species…"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-500 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-zinc-500"
          />
        </label>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          No tree matches{' '}
          <span className="font-mono text-zinc-700 dark:text-zinc-200">{query}</span>.
        </p>
      ) : (
        sections.map(([species, list]) => (
          <SpeciesSection
            key={species}
            species={species}
            entries={list}
            baseUrl={baseUrl}
            defaultOpen={Boolean(query)}
          />
        ))
      )}
    </section>
  );
}
