'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Button from '@/components/Button';
import { AAM_PLATE, drawPlate, plateFileName } from '@/lib/plate.mjs';
import { viewerUrl } from '@/lib/naming.mjs';
import { downloadBlob, generateQrDataUrl, resolveBaseUrl } from '@/lib/qr.mjs';

/** Prototype: number is static until the per-tree data model lands (Phase 1). */
const TREE_NUMBER = 1;

/** JPEG quality for the downloaded plate. The template is itself a JPEG, so 0.95 loses nothing visible. */
const JPEG_QUALITY = 0.95;

const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => '';

/** Promise-wrapped image load so the draw sequence reads top to bottom. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * The Stencil face must be registered with the document before the canvas can
 * use it, or the number silently falls back to serif. Loaded once, cached.
 */
let stencilPromise = null;
function loadStencil() {
  stencilPromise ??= (async () => {
    const face = new FontFace('Stencil', 'url(/fonts/STENCIL.TTF)');
    await face.load();
    globalThis.document.fonts.add(face);
  })();
  return stencilPromise;
}

/**
 * One plate, composed live on a canvas at the template's print resolution
 * (1600x1309 = 5.5in x 4.5in at ~291 DPI). The preview and the downloaded JPG
 * are the same pixels — what you see is exactly what prints.
 */
export default function PlateStudio() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');

  const envUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );
  const baseUrl = resolveBaseUrl(envUrl, origin);
  const qrUrl = baseUrl ? viewerUrl(baseUrl, AAM_PLATE.slug) : '';

  useEffect(() => {
    if (!baseUrl || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const [templateImage, qrDataUrl] = await Promise.all([
          loadImage(AAM_PLATE.template),
          generateQrDataUrl(baseUrl, AAM_PLATE.slug),
          loadStencil(),
        ]);
        const qrImage = await loadImage(qrDataUrl);
        if (cancelled) return;

        const ctx = canvasRef.current.getContext('2d');
        drawPlate(ctx, { templateImage, qrImage, number: TREE_NUMBER, plate: AAM_PLATE });
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message ?? String(err));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const handleDownload = () => {
    canvasRef.current?.toBlob(
      (blob) => {
        if (blob) downloadBlob(blob, plateFileName(AAM_PLATE.species, TREE_NUMBER));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <canvas
          ref={canvasRef}
          width={AAM_PLATE.width}
          height={AAM_PLATE.height}
          className="h-auto w-full"
          aria-label={`Tree plate for ${AAM_PLATE.species} ${TREE_NUMBER}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {status === 'loading' && 'Composing plate…'}
          {status === 'error' && <span className="text-red-600 dark:text-red-400">{error}</span>}
          {status === 'ready' && (
            <>
              QR encodes <span className="break-all text-zinc-800 dark:text-zinc-200">{qrUrl}</span>
              {' · '}
              {AAM_PLATE.width}×{AAM_PLATE.height}px (5.5″×4.5″)
            </>
          )}
        </div>
        <Button variant="primary" onClick={handleDownload} disabled={status !== 'ready'}>
          Download Plate
        </Button>
      </div>
    </div>
  );
}
