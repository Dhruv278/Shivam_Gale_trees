'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { buildQrZip, downloadBlob, formatBytes, generateQrCodes, QR_OPTIONS } from '@/lib/qr.mjs';

const ZIP_NAME = 'qr-codes.zip';

/**
 * Generate + download control block.
 *
 * Always operates on the FULL manifest that is passed in — never on whatever the
 * list happens to be filtered down to — because a print run must be complete.
 */
export default function GeneratePanel({ entries, baseUrl }) {
  const total = entries.length;

  const [status, setStatus] = useState('idle'); // idle | generating | ready | zipping | error
  const [progress, setProgress] = useState({ done: 0, total });
  const [codes, setCodes] = useState([]);
  const [failures, setFailures] = useState([]);
  const [error, setError] = useState(null);
  const [zipSize, setZipSize] = useState(null);
  const [zipPercent, setZipPercent] = useState(0);

  const generating = status === 'generating';
  const zipping = status === 'zipping';
  const hasCodes = codes.length > 0 && (status === 'ready' || zipping);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  async function handleGenerate() {
    setStatus('generating');
    setProgress({ done: 0, total });
    setCodes([]);
    setFailures([]);
    setError(null);
    setZipSize(null);

    try {
      const result = await generateQrCodes(entries, baseUrl, { onProgress: setProgress });
      setCodes(result.codes);
      setFailures(result.failures);
      if (result.codes.length === 0) {
        setError('No QR codes could be generated. See the failures below.');
        setStatus('error');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      setError(err?.message ?? String(err));
      setStatus('error');
    }
  }

  async function handleDownload() {
    setStatus('zipping');
    setZipPercent(0);
    setError(null);
    try {
      const blob = await buildQrZip(codes, { onProgress: setZipPercent });
      downloadBlob(blob, ZIP_NAME);
      setZipSize(blob.size);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setStatus('ready');
    }
  }

  return (
    <section
      aria-labelledby="generate-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="generate-heading"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Generate QR codes
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            All {total} images ·{' '}
            <span className="font-mono">
              {QR_OPTIONS.width}px · margin {QR_OPTIONS.margin} · ECC{' '}
              {QR_OPTIONS.errorCorrectionLevel}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || zipping || !baseUrl || total === 0}
          >
            {generating ? `Generating ${progress.done} / ${progress.total}` : 'Generate QR Codes'}
          </Button>

          {hasCodes && (
            <Button variant="secondary" onClick={handleDownload} disabled={zipping}>
              {zipping ? `Zipping ${Math.round(zipPercent)}%` : 'Download QR Codes'}
            </Button>
          )}
        </div>
      </div>

      {status !== 'idle' && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-4 font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
            <span>
              {progress.done} / {progress.total}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="QR generation progress"
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-150 ease-linear ${
                status === 'error' ? 'bg-red-500' : 'bg-zinc-900 dark:bg-zinc-100'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {(status === 'ready' || status === 'zipping') && (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            {codes.length} QR {codes.length === 1 ? 'code' : 'codes'} ready
          </span>
          {failures.length > 0 && (
            <span className="text-red-700 dark:text-red-400"> · {failures.length} failed</span>
          )}
          {zipSize !== null && (
            <span className="text-zinc-500 dark:text-zinc-400">
              {' '}
              · <span className="font-mono">{ZIP_NAME}</span> downloaded ({formatBytes(zipSize)})
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      {failures.length > 0 && (
        <details className="mt-4 rounded-md border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-950/30">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-red-800 select-none dark:text-red-200">
            {failures.length} {failures.length === 1 ? 'image' : 'images'} failed — show details
          </summary>
          <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-red-200 px-3 py-2 font-mono text-xs text-red-800 dark:border-red-500/30 dark:text-red-200">
            {failures.map((failure) => (
              <li key={failure.file}>
                {failure.file}: {failure.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
