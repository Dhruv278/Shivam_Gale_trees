'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import ImageRow from '@/components/ImageRow';
import { buildBundleZip } from '@/components/BundlePanel';
import { getPlateTemplate } from '@/lib/plate.mjs';
import { downloadBlob } from '@/lib/qr.mjs';
import { viewerUrl } from '@/lib/naming.mjs';

/**
 * One collapsible species section: its trees, its own bundle ZIP.
 * Collapsed by default so the page never mounts every thumbnail at once
 * (native lazy loading bounds the cost of an opened section).
 */
export default function SpeciesSection({ species, entries, baseUrl, defaultOpen = false }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const hasTemplate = Boolean(getPlateTemplate(species));

  async function handleDownload(event) {
    event.preventDefault(); // do not toggle the <details>
    setProgress({ done: 0, total: entries.length });
    setError(null);
    try {
      const { blob, failures } = await buildBundleZip(entries, baseUrl, setProgress);
      downloadBlob(blob, `${species}.zip`);
      if (failures.length > 0) {
        setError(`${failures.length} tree(s) failed: ${failures.map((f) => f.name).join(', ')}`);
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 select-none sm:px-5">
        <span className="flex items-baseline gap-3">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{species}</span>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {entries.length} {entries.length === 1 ? 'tree' : 'trees'} ·{' '}
            {hasTemplate ? 'plate template ready' : 'plate template pending'}
          </span>
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDownload}
          disabled={progress !== null || !baseUrl}
        >
          {progress ? `Bundling ${progress.done}/${progress.total}` : `Download ${species}.zip`}
        </Button>
      </summary>
      {error && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:px-5 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      <ul className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
        {entries.map((entry) => (
          <ImageRow
            key={entry.slug}
            entry={entry}
            baseUrl={baseUrl}
            url={baseUrl ? viewerUrl(baseUrl, entry.slug) : `/view/${entry.slug}`}
          />
        ))}
      </ul>
    </details>
  );
}
