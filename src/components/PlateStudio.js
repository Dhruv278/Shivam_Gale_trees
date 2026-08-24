'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Button from '@/components/Button';
import { drawPlate, getPlateTemplate, plateFileName } from '@/lib/plate.mjs';
import { canvasToJpeg, loadImage, loadStencil } from '@/lib/plate-render.js';
import { viewerUrl } from '@/lib/naming.mjs';
import { downloadBlob, generateQrDataUrl, resolveBaseUrl } from '@/lib/qr.mjs';

const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => '';

/**
 * Pick any photographed tree, preview its plate live on a canvas at the
 * template's print resolution (1600x1309 = 5.5in x 4.5in at ~291 DPI), and
 * download the JPG. Preview and download are the same pixels.
 */
export default function PlateStudio({ entries }) {
  const bySpecies = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.species)) map.set(e.species, []);
      map.get(e.species).push(e);
    }
    return map;
  }, [entries]);
  const speciesList = [...bySpecies.keys()];

  const canvasRef = useRef(null);
  const [species, setSpecies] = useState(speciesList[0] ?? '');
  const [slug, setSlug] = useState(bySpecies.get(speciesList[0])?.[0]?.slug ?? '');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');

  const envUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const origin = useSyncExternalStore(subscribeToOrigin, getOriginSnapshot, getServerOriginSnapshot);
  const baseUrl = resolveBaseUrl(envUrl, origin);

  const treesOfSpecies = bySpecies.get(species) ?? [];
  const entry = treesOfSpecies.find((e) => e.slug === slug) ?? treesOfSpecies[0];
  const plate = getPlateTemplate(species);
  const qrUrl = baseUrl && entry ? viewerUrl(baseUrl, entry.slug) : '';

  useEffect(() => {
    if (!baseUrl || !plate || !entry || !canvasRef.current) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const [templateImage, qrDataUrl] = await Promise.all([
          loadImage(plate.template),
          generateQrDataUrl(baseUrl, entry.slug),
          loadStencil(),
        ]);
        const qrImage = await loadImage(qrDataUrl);
        if (cancelled) return;
        drawPlate(canvasRef.current.getContext('2d'), {
          templateImage,
          qrImage,
          number: entry.number,
          plate,
        });
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? String(err));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, plate, entry]);

  async function handleDownload() {
    downloadBlob(await canvasToJpeg(canvasRef.current), plateFileName(entry.species, entry.number));
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No tree photos yet — drop some into public/images/&lt;Species&gt;/.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Species</span>
          <select
            value={species}
            onChange={(e) => {
              setSpecies(e.target.value);
              setSlug(bySpecies.get(e.target.value)?.[0]?.slug ?? '');
            }}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {speciesList.map((s) => (
              <option key={s} value={s}>
                {s} ({bySpecies.get(s).length}){getPlateTemplate(s) ? '' : ' — template pending'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Tree</span>
          <select
            value={entry?.slug ?? ''}
            onChange={(e) => setSlug(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {treesOfSpecies.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!plate ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
          No plate template for {species} yet. Drop its artwork in public/plates/ and register it in
          src/lib/plate.mjs.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <canvas
              ref={canvasRef}
              width={plate.width}
              height={plate.height}
              className="h-auto w-full"
              aria-label={`Tree plate for ${entry?.name ?? species}`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {status === 'loading' && 'Composing plate…'}
              {status === 'error' && (
                <span className="text-red-600 dark:text-red-400">{error}</span>
              )}
              {status === 'ready' && (
                <>
                  QR encodes{' '}
                  <span className="break-all text-zinc-800 dark:text-zinc-200">{qrUrl}</span>
                </>
              )}
            </div>
            <Button variant="primary" onClick={handleDownload} disabled={status !== 'ready'}>
              Download Plate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
