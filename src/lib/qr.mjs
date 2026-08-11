/**
 * QR generation, ZIP bundling and download plumbing.
 *
 * Kept out of the components so the risky parts (what gets encoded, what the ZIP
 * entries are named, how progress is reported) are plain functions that can be
 * unit tested without a DOM. Every browser-only API is reached through
 * `globalThis` or an injectable parameter for the same reason.
 *
 * Hard rules encoded here:
 *   - a QR code contains the viewer URL and nothing else (never an image path);
 *   - a ZIP entry is named `entry.qrName` verbatim, so the QR file keeps the
 *     original image basename;
 *   - one bad entry must never lose the other results.
 */

import { viewerUrl } from './naming.mjs';

/**
 * `qrcode` and `jszip` are loaded on first use rather than imported eagerly:
 *
 *   - nothing here runs until a button is clicked, so they stay out of the
 *     initial page bundle;
 *   - `qrcode`'s Node entry point pulls in pngjs (a devDependency) — keeping the
 *     import lazy means the server render never touches that path at all.
 *
 * The promise is cached so concurrent callers share one load.
 */
const interop = (mod) => mod?.default ?? mod;
let qrcodePromise = null;
let jszipPromise = null;

function importQrcode() {
  qrcodePromise ??= import('qrcode').then(interop);
  return qrcodePromise;
}

function importJsZip() {
  jszipPromise ??= import('jszip').then(interop);
  return jszipPromise;
}

/**
 * Default renderer: PNG data URL, drawn on a canvas in the browser.
 *
 * The options object is copied per call because `qrcode` mutates it
 * (`renderer/utils.getOptions` assigns `options.color`). Handing it our frozen
 * QR_OPTIONS makes that write fail silently in its non-strict CommonJS and the
 * renderer then throws on `options.color.dark`.
 */
async function renderQrDataUrl(text, options) {
  const qrcode = await importQrcode();
  return qrcode.toDataURL(text, { ...options });
}

/**
 * Print settings. 512 px keeps a scannable module size on a label, margin 2 is
 * the minimum quiet zone most scanners tolerate, 'M' balances density against
 * ink smudge on cheap stock.
 */
export const QR_OPTIONS = Object.freeze({
  width: 512,
  margin: 2,
  errorCorrectionLevel: 'M',
});

/** Items generated between progress reports / event-loop yields. */
export const YIELD_EVERY = 25;

/** Blob URLs are revoked a task later: revoking in the click tick aborts the download in some browsers. */
const REVOKE_DELAY_MS = 1000;

/**
 * Base URL the QR codes will encode.
 *
 * `envUrl` (NEXT_PUBLIC_SITE_URL) wins because it is the only value that is
 * stable across machines; `origin` is the local fallback so the tool is usable
 * before the domain exists. Returns '' when neither is known yet (SSR).
 */
export function resolveBaseUrl(envUrl, origin) {
  const raw = (envUrl || origin || '').trim();
  return raw.replace(/\/+$/, '');
}

/** Strip the `data:image/png;base64,` prefix. */
export function dataUrlToBase64(dataUrl) {
  const comma = String(dataUrl).indexOf(',');
  if (comma === -1) throw new Error('Malformed data URL: no payload separator');
  return String(dataUrl).slice(comma + 1);
}

/** Decode a base64 data URL into a Blob (browser only). */
export function dataUrlToBlob(dataUrl, type = 'image/png') {
  const binary = globalThis.atob(dataUrlToBase64(dataUrl));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Hand control back to the browser so React can paint. Without this the
 * generation loop hogs the task and the progress bar jumps 0 -> 100.
 * `setTimeout` (a macrotask) is used deliberately: microtask-based yields do
 * not guarantee a frame.
 */
export function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** One QR PNG as a data URL for a single manifest entry. */
export function generateQrDataUrl(baseUrl, slug, options = {}) {
  const { toDataURL = renderQrDataUrl, qrOptions = QR_OPTIONS } = options;
  return toDataURL(viewerUrl(baseUrl, slug), qrOptions);
}

/**
 * Generate a QR PNG for every entry.
 *
 * Fault tolerant by design: a throwing entry is recorded in `failures` and the
 * loop continues, so a single bad slug cannot cost a whole print run.
 *
 * @param {Array<{file: string, slug: string, qrName: string}>} entries
 * @param {string} baseUrl
 * @param {{onProgress?: Function, yieldEvery?: number, toDataURL?: Function, qrOptions?: object}} options
 * @returns {Promise<{codes: Array, failures: Array, total: number}>}
 */
export async function generateQrCodes(entries, baseUrl, options = {}) {
  const {
    onProgress,
    yieldEvery = YIELD_EVERY,
    toDataURL = renderQrDataUrl,
    qrOptions = QR_OPTIONS,
  } = options;

  if (!baseUrl) throw new Error('Base URL is not resolved yet - cannot encode QR codes.');

  const total = entries.length;
  const codes = [];
  const failures = [];

  onProgress?.({ done: 0, total });

  for (let i = 0; i < total; i += 1) {
    const entry = entries[i];
    try {
      const url = viewerUrl(baseUrl, entry.slug);
      // Sequential on purpose: bounded memory and honest progress beat throughput here.
      const dataUrl = await toDataURL(url, qrOptions);
      codes.push({ qrName: entry.qrName, file: entry.file, slug: entry.slug, url, dataUrl });
    } catch (error) {
      failures.push({
        file: entry?.file ?? `entry ${i}`,
        slug: entry?.slug ?? '',
        message: error?.message ?? String(error),
      });
    }

    const done = i + 1;
    if (done % yieldEvery === 0 || done === total) {
      onProgress?.({ done, total });
      await yieldToEventLoop();
    }
  }

  return { codes, failures, total };
}

/**
 * Bundle generated PNGs into a single ZIP.
 *
 * STORE, not DEFLATE: PNG payloads are already deflated, so compressing again
 * buys ~nothing and costs seconds at 1,700 files.
 */
export async function buildQrZip(codes, options = {}) {
  const { type = 'blob', onProgress } = options;
  if (!codes?.length) throw new Error('Nothing to bundle - generate QR codes first.');

  const JSZipCtor = options.JSZipCtor ?? (await importJsZip());
  const zip = new JSZipCtor();
  for (const code of codes) {
    // `code.qrName` verbatim: the QR file must keep the original image basename.
    zip.file(code.qrName, dataUrlToBase64(code.dataUrl), { base64: true });
  }

  return zip.generateAsync({ type, compression: 'STORE' }, (meta) => {
    onProgress?.(meta.percent);
  });
}

/** Save a Blob to disk via an anchor, then release the object URL. */
export function downloadBlob(blob, filename) {
  const doc = globalThis.document;
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return url;
}

/** Save a data URL to disk under `filename`. */
export function downloadDataUrl(dataUrl, filename) {
  return downloadBlob(dataUrlToBlob(dataUrl), filename);
}

/** "1.4 MB" - for reporting ZIP size. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
