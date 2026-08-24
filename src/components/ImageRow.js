'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { encodePath } from '@/lib/naming.mjs';
import { downloadDataUrl, generateQrDataUrl } from '@/lib/qr.mjs';

const COPIED_MS = 1400;

/** Small enough that 60 of them cost nothing; the browser still lazy-loads them. */
const THUMB_PX = 44;

export default function ImageRow({ entry, baseUrl, url }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setFailed(true);
    }
  }

  async function handleDownload() {
    setBusy(true);
    setFailed(false);
    try {
      const dataUrl = await generateQrDataUrl(baseUrl, entry.slug);
      downloadDataUrl(dataUrl, entry.qrName);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-900">
      {/*
        Plain <img>, not next/image: these are ~1 MB source files rendered at 44px
        purely as an identification aid. next/image would queue an optimizer
        request per row; native lazy loading plus a hard CSS box is cheaper and
        the pagination window keeps the row count bounded.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/images/${encodePath(entry.file)}`}
        alt=""
        loading="lazy"
        decoding="async"
        width={THUMB_PX}
        height={THUMB_PX}
        className="h-11 w-11 shrink-0 rounded-md border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-800"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {entry.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-600 dark:text-zinc-300">{entry.slug}</span>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
            |
          </span>
          <span className="truncate">{url}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {failed && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">failed</span>
        )}
        <Button size="sm" variant="ghost" onClick={handleCopy} aria-label={`Copy URL for ${entry.name}`}>
          {copied ? 'Copied' : 'Copy URL'}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          Open
        </a>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDownload}
          disabled={busy || !baseUrl}
          aria-label={`Download QR code for ${entry.name}`}
        >
          {busy ? '…' : 'Download QR'}
        </Button>
      </div>
    </li>
  );
}
