import PlateStudio from '@/components/PlateStudio';

export const metadata = {
  title: 'Plate Generator',
  description: 'Compose and download a printable tree plate with its QR code.',
};

/**
 * Prototype plate generator (Task 1 of the plate roadmap — see
 * docs/plate-plan.html). One species (Aam/आम), one static tree number; the
 * per-tree dynamic version arrives with the Excel-driven manifest in Phase 1.
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
            prototype · Aam (आम) · tree 1
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <PlateStudio />
      </main>
    </div>
  );
}
