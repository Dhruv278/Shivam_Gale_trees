import { notFound } from 'next/navigation';
import manifest from '@/data/manifest.json';
import { encodePath } from '@/lib/naming.mjs';

/**
 * The scan target. A customer points a phone camera at a printed QR code and lands here,
 * so this route renders the image and nothing else: no header, footer, caption, download
 * button or navigation. Anything extra is chrome the customer did not ask for.
 */

/** Slug -> manifest entry. Built once per process; the manifest is a static build artifact. */
const bySlug = new Map(manifest.map((entry) => [entry.slug, entry]));

/**
 * Prerender every slug at build time so a scan is served straight from the CDN.
 * These URLs are printed on physical labels - they must not depend on a warm server.
 */
export async function generateStaticParams() {
  return manifest.map((entry) => ({ slug: entry.slug }));
}

/**
 * Static viewport: the root layout does not export one, and phones must not zoom out
 * to a desktop-width canvas or the image would render as a postage stamp.
 * `colorScheme: 'dark'` keeps the browser's own surfaces matching the dark backdrop.
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#171717',
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = bySlug.get(slug);
  if (!entry) return {};
  return { title: entry.name };
}

export default async function Page({ params }) {
  // Next.js 16: `params` is a Promise and must be awaited.
  const { slug } = await params;
  const entry = bySlug.get(slug);
  if (!entry) notFound();

  // `file` contains a species folder ("Aam/Aam 1.jpg"); encode per segment or the image 404s.
  const src = `/images/${encodePath(entry.file)}`;

  return (
    /*
      The root layout renders `<body className="min-h-full flex flex-col">` and `<html className="h-full">`,
      so `flex-1` stretches this section to the full viewport height without editing that file.
      `min-h-0` matters: a flex item defaults to `min-height: auto`, so a 3000px-tall source
      image would otherwise floor the item at its own natural height and make the page scroll.
      The image is positioned rather than laid out inline for the same reason - an absolutely
      positioned child contributes nothing to the section's intrinsic height.
    */
    <section className="relative min-h-0 flex-1 overflow-hidden bg-[#171717]">
      {/*
        Deliberately a plain <img>, not next/image: next/image optimization is metered
        per account on Vercel, and these URLs back a physical print run. A quota breach
        would break already-printed QR codes, so the image is served as a static asset.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={entry.name}
        // Fills the viewport box; `object-contain` then centres and scales the whole image
        // inside it, so nothing is cropped and there is never a horizontal scrollbar.
        // (`h-full w-full` is required: `inset-0` alone leaves a replaced element at its
        // intrinsic size.)
        className="absolute inset-0 h-full w-full object-contain"
        // The only content on the page - never lazy-load it.
        loading="eager"
        decoding="async"
      />
    </section>
  );
}
