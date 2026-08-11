import { SUPPORTED_EXTENSIONS } from '@/lib/naming.mjs';

/** Shown when the manifest has no entries — tells you exactly how to fix it. */
export default function EmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm sm:p-12 dark:border-zinc-700 dark:bg-zinc-900/60">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">No images found</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        The manifest is empty, so there is nothing to encode. Drop your image files into{' '}
        <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">public/images/</span>{' '}
        then regenerate the list:
      </p>
      <p className="mx-auto mt-5 w-fit rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        npm run manifest
      </p>
      <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">
        Supported extensions:{' '}
        <span className="font-mono">{SUPPORTED_EXTENSIONS.join(', ')}</span>. The manifest is also
        rebuilt automatically by <span className="font-mono">npm run dev</span> and{' '}
        <span className="font-mono">npm run build</span>.
      </p>
    </section>
  );
}
