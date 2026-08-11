'use client';

import { useSyncExternalStore } from 'react';
import BaseUrlBanner from '@/components/BaseUrlBanner';
import GeneratePanel from '@/components/GeneratePanel';
import ImageList from '@/components/ImageList';
import { resolveBaseUrl } from '@/lib/qr.mjs';

/**
 * `window.location.origin` read the SSR-safe way.
 *
 * The origin does not exist during prerender, and reading it in a `useState`
 * initialiser would make the hydration render disagree with the server HTML.
 * `useSyncExternalStore` is built for exactly this: it uses the server snapshot
 * ('') while hydrating, then re-renders once with the real value. The origin
 * never changes without a navigation, so `subscribe` is a no-op.
 */
const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => '';

/**
 * Client shell that owns the one piece of state everything else depends on: the
 * base URL the QR codes will encode.
 *
 * `NEXT_PUBLIC_SITE_URL` is inlined at build time, so it is identical on server
 * and client; the origin is the fallback. Until a base URL is known, the UI says
 * so rather than guessing.
 */
export default function Portal({ entries }) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );

  const envConfigured = envUrl.trim().length > 0;
  const baseUrl = resolveBaseUrl(envUrl, origin);

  return (
    <div className="space-y-6">
      <BaseUrlBanner
        baseUrl={baseUrl}
        envConfigured={envConfigured}
        exampleSlug={entries[0]?.slug}
      />
      <GeneratePanel entries={entries} baseUrl={baseUrl} />
      <ImageList entries={entries} baseUrl={baseUrl} />
    </div>
  );
}
