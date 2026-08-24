import manifest from '@/data/manifest.json';
import PlateStudio from '@/components/PlateStudio';
import { PLATE_TEMPLATES } from '@/lib/plate.mjs';

export const metadata = {
  title: 'Plate Generator',
  description: 'Compose and download printable tree plates with QR codes.',
};

/**
 * Plate generator over the photographed trees (see docs/plate-plan.html).
 * Server component hands the manifest to the client shell, matching how the
 * portal page works.
 */
export default function PlatePage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 sm:px-6">
          <h1 className="text-sm font-semibold tracking-[0.14em] text-zinc-900 uppercase dark:text-zinc-100">
            Plate Generator
          </h1>
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {manifest.length} trees · templates ready: {Object.keys(PLATE_TEMPLATES).join(', ')}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <PlateStudio entries={manifest} />
      </main>
    </div>
  );
}
