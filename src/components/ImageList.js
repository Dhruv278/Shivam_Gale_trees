'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/Button';
import ImageRow from '@/components/ImageRow';
import { viewerUrl } from '@/lib/naming.mjs';

/**
 * DOM-cap strategy: PAGINATION (60 rows per page), not scroll windowing.
 *
 * The requirement is only that the DOM never holds 1,700 rows / 1,700 ~1 MB
 * thumbnails. Pagination achieves that with a hard, predictable ceiling and no
 * scroll math, no measured row heights and no resize observers — a scroll
 * window would be strictly more code for the same guarantee here, and this list
 * is a lookup tool (search + jump) rather than something you read top to bottom.
 * Native `loading="lazy"` on a 44px box then means only the thumbnails actually
 * on screen are fetched, so a page costs at most a few dozen image requests.
 */
const PAGE_SIZE = 60;

export default function ImageList({ entries, baseUrl }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) || entry.file.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function handleQueryChange(event) {
    setQuery(event.target.value);
    setPage(1);
  }

  return (
    <section
      aria-labelledby="images-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
        <div>
          <h2
            id="images-heading"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {entries.length} {entries.length === 1 ? 'image' : 'images'} found
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {filtered.length === entries.length
              ? `Showing ${filtered.length === 0 ? 0 : start + 1}–${start + visible.length}`
              : `${filtered.length} matching · showing ${
                  visible.length === 0 ? 0 : start + 1
                }–${start + visible.length}`}
            {pageCount > 1 && ` · page ${current} of ${pageCount}`}
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="w-full sm:w-72">
            <span className="sr-only">Search images</span>
            <input
              type="search"
              // `id`/`name` keep the browser from flagging an unidentified form field
              // and let it remember the filter across reloads.
              id="image-search"
              name="image-search"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search name or file…"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-500 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-zinc-500"
            />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No image matches <span className="font-mono text-zinc-700 dark:text-zinc-200">{query}</span>
          .
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {visible.map((entry) => (
            <ImageRow
              key={entry.slug}
              entry={entry}
              baseUrl={baseUrl}
              url={baseUrl ? viewerUrl(baseUrl, entry.slug) : `/view/${entry.slug}`}
            />
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-zinc-200 px-4 py-3 sm:px-5 dark:border-zinc-800">
          <Button size="sm" onClick={() => setPage(current - 1)} disabled={current <= 1}>
            Previous
          </Button>
          <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {current} / {pageCount}
          </span>
          <Button size="sm" onClick={() => setPage(current + 1)} disabled={current >= pageCount}>
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
