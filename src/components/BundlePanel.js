'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { bundlePaths } from '@/lib/bundle.mjs';
import { encodePath } from '@/lib/naming.mjs';
import { getPlateTemplate } from '@/lib/plate.mjs';
import { loadImage, renderPlateBlob } from '@/lib/plate-render.js';
import {
  dataUrlToBase64,
  downloadBlob,
  formatBytes,
  generateQrDataUrl,
  yieldToEventLoop,
} from '@/lib/qr.mjs';

/**
 * Builds a bundle ZIP: <Species>/{images,qr,plates}/<Name>.* for every entry.
 * Sequential on purpose - bounded memory and honest progress, same reasoning
 * as generateQrCodes. Template images are cached per species per run.
 *
 * NOTE test-scale tool: at 1,700 trees this holds the whole run in browser
 * memory - the production path is scripts/generate-print-files.mjs.
 */
export async function buildBundleZip(entries, baseUrl, onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const templates = new Map(); // species -> loaded template Image or null
  const failures = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    try {
      const plate = getPlateTemplate(entry.species);
      if (!templates.has(entry.species)) {
        templates.set(entry.species, plate ? await loadImage(plate.template) : null);
      }
      const paths = bundlePaths(entry, Boolean(plate));

      const res = await fetch(`/images/${encodePath(entry.file)}`);
      if (!res.ok) throw new Error(`image fetch ${res.status}`);
      zip.file(paths.image, await res.blob());

      zip.file(paths.qr, dataUrlToBase64(await generateQrDataUrl(baseUrl, entry.slug)), {
        base64: true,
      });

      if (paths.plate) {
        zip.file(
          paths.plate,
          await renderPlateBlob({
            plate,
            baseUrl,
            slug: entry.slug,
            number: entry.number,
            templateImage: templates.get(entry.species),
          }),
        );
      }
    } catch (error) {
      failures.push({ name: entry.name, message: error?.message ?? String(error) });
    }
    onProgress?.({ done: i + 1, total: entries.length });
    if ((i + 1) % 10 === 0) await yieldToEventLoop();
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, failures };
}

/** "Download All" over the full manifest: every species folder in one ZIP. */
export default function BundlePanel({ entries, baseUrl }) {
  const [progress, setProgress] = useState(null); // null | {done, total}
  const [result, setResult] = useState(null); // null | {size, failures}
  const [error, setError] = useState(null);

  async function handleDownloadAll() {
    setProgress({ done: 0, total: entries.length });
    setResult(null);
    setError(null);
    try {
      const { blob, failures } = await buildBundleZip(entries, baseUrl, setProgress);
      downloadBlob(blob, 'all-species.zip');
      setResult({ size: blob.size, failures });
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setProgress(null);
    }
  }

  const speciesCount = new Set(entries.map((e) => e.species)).size;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Download everything
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {entries.length} trees · {speciesCount} species · each species folder holds{' '}
            <span className="font-mono">images/ · qr/ · plates/</span> with matching names
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleDownloadAll}
          disabled={progress !== null || !baseUrl || entries.length === 0}
        >
          {progress ? `Bundling ${progress.done} / ${progress.total}` : 'Download All (ZIP)'}
        </Button>
      </div>
      {result && (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            all-species.zip downloaded
          </span>
          <span className="text-zinc-500 dark:text-zinc-400"> ({formatBytes(result.size)})</span>
          {result.failures.length > 0 && (
            <span className="text-red-700 dark:text-red-400">
              {' '}
              · {result.failures.length} tree(s) failed:{' '}
              {result.failures.map((f) => f.name).join(', ')}
            </span>
          )}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
