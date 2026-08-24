'use client';

/**
 * Browser-side plate rendering shared by the plate page and the bundle ZIPs.
 * Kept out of plate.mjs so the pure geometry stays DOM-free and testable.
 */
import { drawPlate } from '@/lib/plate.mjs';
import { generateQrDataUrl } from '@/lib/qr.mjs';

export const JPEG_QUALITY = 0.95;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

let stencilPromise = null;
/** Register the Stencil face once; canvases silently fall back to serif without it. */
export function loadStencil() {
  stencilPromise ??= (async () => {
    const face = new FontFace('Stencil', 'url(/fonts/STENCIL.TTF)');
    await face.load();
    globalThis.document.fonts.add(face);
  })();
  return stencilPromise;
}

export function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/** Compose one plate to a JPEG blob on a throwaway canvas. */
export async function renderPlateBlob({ plate, baseUrl, slug, number, templateImage }) {
  await loadStencil();
  const qrImage = await loadImage(await generateQrDataUrl(baseUrl, slug));
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = plate.width;
  canvas.height = plate.height;
  drawPlate(canvas.getContext('2d'), { templateImage, qrImage, number, plate });
  return canvasToJpeg(canvas);
}
